const Complaint = require('../models/Complaint');
const User = require('../models/User');
const axios = require('axios');

/**
 * AI Central Intelligence Assistant
 * - System Aware
 * - Real-time Data Access (Complaint, Officer, REPORT, Stats, Search)
 * - User-Specific Context (Authenticated)
 * - Dynamic Reasoning
 */

const handleChat = async (req, res) => {
  const { message, history, language } = req.body;
  const user = req.user;
  const isTeluguMode = language === 'te';

  try {
    if (!process.env.GROQ_API_KEY) {
      return res.json({ 
        reply: "System Intelligence Offline: Please configure `GROQ_API_KEY`." 
      });
    }

    // 1. INTENT EXTRACTION LAYER
    const intentPrompt = `You are a system-intent-extractor for a governance platform.
    Analyze the user message and history to decide which data to fetch.
    
    User Message: "${message}"
    User Context: ${user ? `${user.name} (${user.role})` : 'Anonymous'}

    Possible Intents:
    - GET_COMPLAINT_DETAILS: Specific case lookup (requires COMP- ID)
    - SEARCH_COMPLAINTS: "High risk complaints", "Pending cases", "Theft reports", "What are the latest issues?"
    - LIST_MY_COMPLAINTS: "Show my complaints", "Status of my reports"
    - SEARCH_OFFICER: Questions about specific officers
    - SYSTEM_STATS: "Total complaints", "How many cases are resolved?"
    - GENERAL: Help, greetings

    Return JSON ONLY:
    {
      "intent": "GET_COMPLAINT_DETAILS" | "SEARCH_COMPLAINTS" | "LIST_MY_COMPLAINTS" | "SEARCH_OFFICER" | "SYSTEM_STATS" | "GENERAL",
      "criteria": {
        "status": string | null,
        "priority": "Low" | "Medium" | "High" | "Critical" | null,
        "category": string | null,
        "entityId": string | null,
        "entityName": string | null
      }
    }`;

    let intent = { intent: 'GENERAL', criteria: {} };
    try {
      const intentResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: 'llama-3.1-8b-instant',
          response_format: { type: "json_object" },
          messages: [{ role: 'system', content: intentPrompt }],
          temperature: 0
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
          }
        });
      intent = JSON.parse(intentResponse.data.choices[0].message.content);
    } catch (e) {
      console.error("Intent extraction failed:", e.message);
    }

    // 2. DATA FETCHING LAYER
    let systemData = "No specific data requested.";
    let dataFound = false;
    
    // Auto-detect COMP- patterns regardless of intent
    const manualMatch = message.match(/COMP-[0-9]+/i);
    let targetId = (intent.criteria?.entityId && intent.criteria.entityId !== 'null') ? intent.criteria.entityId : (manualMatch?.[0]);

    if (targetId && !targetId.startsWith('COMP-') && !targetId.match(/^[0-9a-fA-F]{24}$/) && targetId.match(/^[0-9]+$/)) {
        targetId = `COMP-${targetId}`;
    }
    if (targetId) targetId = String(targetId).split(' ')[0].trim();

    if (intent.intent === 'GET_COMPLAINT_DETAILS' || targetId) {
      if (targetId) {
        const queryId = String(targetId).toUpperCase();
        const complaint = await Complaint.findOne({ 
          $or: [{ complaintId: queryId }, { _id: queryId.length === 24 ? queryId : null }]
        })
        .populate('assignedOfficerUserId', 'name rank')
        .populate('assignedDepartmentId', 'name');

        if (complaint) {
          dataFound = true;
          systemData = `LIVE DOSSIER ${complaint.complaintId}: Status is ${complaint.status}, Priority ${complaint.priority}, Category ${complaint.category}. Assigned to Officer ${complaint.assignedOfficerUserId?.name || 'Unassigned'}. Description: ${complaint.description}. REPORT Summary: ${complaint.reportData?.summary || 'None'}.`;
        } else {
          systemData = `SEARCH ERROR: Complaint ID "${targetId}" not found. Inform user to verify.`;
        }
      }
    } else if (intent.intent === 'SEARCH_COMPLAINTS') {
        // Dynamic search based on criteria
        let query = {};
        if (message.toLowerCase().includes('high risk') || message.toLowerCase().includes('critical') || intent.criteria?.priority === 'High' || intent.criteria?.priority === 'Critical') {
            query.priority = { $in: ['High', 'Critical'] };
        }
        if (intent.criteria?.status) query.status = intent.criteria.status;
        if (intent.criteria?.category) query.category = new RegExp(intent.criteria.category, 'i');

        const results = await Complaint.find(query).sort({ createdAt: -1 }).limit(10).populate('assignedOfficerUserId', 'name');
        if (results.length > 0) {
            dataFound = true;
            systemData = `SEARCH RESULTS (${results.length} cases):
            ${results.map(c => `- ${c.complaintId}: ${c.category} (Risk: ${c.priority}, Status: ${c.status}) - Assigned: ${c.assignedOfficerUserId?.name || 'Unassigned'}`).join('\n')}`;
        } else {
            systemData = `SEARCH NOTIFICATION: No complaints matching those criteria are currently registered in the database.`;
        }
    } else if (intent.intent === 'LIST_MY_COMPLAINTS' && user) {
        const myComplaints = await Complaint.find({ citizenUserId: user._id }).sort({ createdAt: -1 }).limit(10);
        if (myComplaints.length > 0) {
            dataFound = true;
            systemData = `YOUR RECENT COMPLAINTS (${user.name}):\n${myComplaints.map(c => `- ${c.complaintId}: ${c.status}`).join('\n')}`;
        } else {
            systemData = `You have not filed any complaints yet.`;
        }
    } else if (intent.intent === 'SYSTEM_STATS') {
      const stats = await Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
      const totalCount = await Complaint.countDocuments();
      const highRiskCount = await Complaint.countDocuments({ priority: { $in: ['High', 'Critical'] } });
      dataFound = true;
      systemData = `SYSTEM ANALYTICS: Total ${totalCount} cases, High-Risk cases: ${highRiskCount}. Distribution: ${stats.map(s => `${s._id}: ${s.count}`).join(', ')}`;
    } else if (intent.intent === 'SEARCH_OFFICER') {
      const namePattern = intent.criteria?.entityName || message.replace(/staff/gi, '').trim();
      const officers = await User.find({ role: 'STAFF', name: new RegExp(namePattern, 'i') }).limit(3);
      if (officers.length > 0) {
        dataFound = true;
        systemData = `OFFICERS FOUND: ${officers.map(o => `${o.name} (${o.rank})`).join(', ')}`;
      } else {
        systemData = `No active officer found matching that name.`;
      }
    } else {
      const stats = await Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
      systemData = `Platform State: ${stats.map(s => `${s._id}: ${s.count}`).join(', ') || 'Ready.'}`;
    }

    // 3. RESPONSE GENERATION LAYER
    const langInstruction = isTeluguMode
      ? `\n\nIMPORTANT: The user has selected Telugu language mode. You MUST reply ENTIRELY in Telugu (తెలుగులో సమాధానం ఇవ్వండి). Use Telugu script for ALL your responses. Proper formal Telugu only.`
      : '';

    const finalSystemPrompt = `You are the "Central Intelligence Assistant" of CitizenCare.
    You HAVE direct database access. 
    
    SYSTEM INTELLIGENCE:
    ${systemData}

    [DATA_VERIFIED: ${dataFound}]

    RULES:
    1. Answer queries directly using the SYSTEM INTELLIGENCE above.
    2. If the user asks for "high risk" complaints and the data shows them, LIST them individually.
    3. If no specific data is found, state it clearly: "There are currently NO complaints registered that match that specific criteria."
    4. NEVER say "I don't have information" if the data above provides it.
    5. Be professional and authoritative.
    ${langInstruction}

    User Persona: ${user ? user.name : 'User'}`;

    const chatResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: finalSystemPrompt },
          ...(history || []).map(h => ({ role: h.role, content: String(h.content) })),
          { role: 'user', content: message }
        ],
        temperature: 0.3
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        }
      });

    res.json({ reply: chatResponse.data.choices[0].message.content });

  } catch (error) {
    console.error("Central AI Error:", error.message);
    res.status(500).json({ reply: "Connection to central intelligence interrupted. Please attempt later." });
  }
};

module.exports = { handleChat };
