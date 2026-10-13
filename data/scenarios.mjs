const commonPolicy = [
  "This is a fictional telecom support exercise, not a real operator's policy.",
  "Use only the facts below or supplied tool results; do not invent account changes.",
  "Follow the current request. A user-led topic change is valid.",
  "Retain relevant earlier facts, accept explicit corrections, and keep people and topics separate.",
  "An explicitly withdrawn request must not be resumed. Clarify ambiguous references before acting.",
  "For an interrupted request, resume when invited; do not claim it was completed while it was pending.",
].join(" ");

function scenario(value) {
  return { ...value, system: `${commonPolicy}\n\nScenario facts: ${value.facts}` };
}

function billMessages(accountId, total, roaming, callId) {
  return [
    {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: callId,
        type: "function",
        function: {
          name: "get_bill",
          arguments: JSON.stringify({ account_id: accountId }),
        },
      }],
    },
    {
      role: "tool",
      tool_call_id: callId,
      content: JSON.stringify({
        account_id: accountId,
        currency: "GBP",
        total,
        charges: { plan: 24, roaming },
      }),
    },
    {
      role: "assistant",
      content: `The bill for ${accountId} is GBP ${total}: GBP 24 for the plan and GBP ${roaming} for roaming.`,
    },
  ];
}

const billTool = {
  name: "get_bill",
  description: "Read a fictional account's bill. This tool does not change an account.",
  parameters: {
    type: "object",
    properties: { account_id: { type: "string", enum: ["DEMO-001", "DEMO-002"] } },
    required: ["account_id"],
    additionalProperties: false,
  },
};

export const scenarios = [
  scenario({
    id: "billing-baseline",
    title: "Explain a bill",
    split: "calibration",
    focus: "evidence_and_action_integrity",
    topics: ["billing"],
    facts: "The plan costs GBP 24 monthly. June's bill is GBP 30, including a single GBP 6 roaming charge. The roaming charge is not recurring.",
    turns: [
      {
        id: "bill-reason", topic: "billing",
        user: "My June bill is GBP 30 instead of GBP 24. Why?",
        assistant: "It includes your GBP 24 plan plus a one-off GBP 6 roaming charge.",
      },
      {
        id: "recurrence", topic: "billing",
        user: "Will that extra charge appear every month?",
        assistant: "No. This GBP 6 charge is one-off; your regular plan remains GBP 24 monthly.",
      },
    ],
    outcomes: [
      { id: "explain-charge", description: "Explain the GBP 6 difference using the supplied bill facts.", evidenceTurns: ["bill-reason"] },
      { id: "recurrence", description: "Explain that the extra charge is one-off, not a recurring subscription.", evidenceTurns: ["recurrence"] },
    ],
    fault: {
      turnId: "recurrence",
      assistant: "Yes. This GBP 6 charge is recurring; your regular monthly bill will now be GBP 30.",
      violatedOutcome: "recurrence",
      explanation: "The response contradicts the supplied one-off charge policy.",
    },
  }),
  scenario({
    id: "resolved-topic-switch",
    title: "Finish billing, then discuss roaming",
    split: "calibration",
    focus: "topic_switching",
    topics: ["billing", "roaming"],
    facts: "June's bill is GBP 30: plan GBP 24 and one-off roaming GBP 6. France roaming is included. Enable it under Settings > Mobile > Data roaming.",
    turns: [
      {
        id: "billing", topic: "billing",
        user: "Why is my June bill GBP 30 rather than GBP 24?",
        assistant: "The difference is a one-off GBP 6 roaming charge added to your GBP 24 plan.",
      },
      {
        id: "switch", topic: "roaming",
        user: "That explains the bill. New question: is France included, and how do I enable roaming?",
        assistant: "France roaming is included. Enable it under Settings > Mobile > Data roaming.",
      },
    ],
    outcomes: [
      { id: "billing-resolved", description: "Explain the bill before moving on.", evidenceTurns: ["billing"] },
      { id: "follow-switch", description: "Answer the new France roaming question, including the activation path.", evidenceTurns: ["switch"] },
    ],
    fault: {
      turnId: "switch",
      assistant: "Your June bill includes the one-off GBP 6 roaming charge. The plan itself is still GBP 24.",
      violatedOutcome: "follow-switch",
      explanation: "Accurate billing information is repeated instead of addressing the explicitly new topic.",
    },
  }),
  scenario({
    id: "return-to-billing",
    title: "Billing, roaming, then back to billing",
    split: "calibration",
    focus: "context_retention",
    topics: ["billing", "roaming"],
    facts: "June's bill includes a one-off GBP 6 roaming charge. Germany roaming costs GBP 3 per day. These are separate charges.",
    turns: [
      {
        id: "bill", topic: "billing",
        user: "Tell me the extra charge on my June bill and whether it is recurring.",
        assistant: "The extra charge is GBP 6 for roaming, and it is one-off.",
      },
      {
        id: "germany", topic: "roaming",
        user: "Separately, what would roaming in Germany cost next month?",
        assistant: "Germany roaming costs GBP 3 per day.",
      },
      {
        id: "return", topic: "billing",
        user: "Back to that June bill: how much was the extra charge, and was it recurring?",
        assistant: "The June extra charge was GBP 6, and it was one-off, not recurring.",
      },
    ],
    outcomes: [
      { id: "future-rate", description: "State Germany's future daily rate separately from the historic bill.", evidenceTurns: ["germany"] },
      { id: "recover-bill", description: "Recover June's GBP 6 one-off charge when the user returns to billing.", evidenceTurns: ["bill", "return"] },
    ],
    fault: {
      turnId: "return",
      assistant: "The June extra charge was GBP 3 per day, and it continues for each day you use roaming.",
      violatedOutcome: "recover-bill",
      explanation: "The agent substitutes the newer Germany rate for the earlier bill facts.",
    },
  }),
  scenario({
    id: "resume-unfinished-request",
    title: "Resume a request after an interruption",
    split: "calibration",
    focus: "request_coverage",
    topics: ["billing", "roaming"],
    facts: "To explain how to dispute a charge, first ask its date, then direct the user to Support > Billing > Dispute and to include the date and amount. France roaming is included; enable it under Settings > Mobile > Data roaming. Giving directions does not open a dispute.",
    turns: [
      {
        id: "pending", topic: "billing",
        user: "I want you to explain how to dispute a GBP 6 charge. Once I give you its date, please finish those instructions even if I ask another question.",
        assistant: "What date was that GBP 6 charge? I need it to give you the dispute instructions.",
      },
      {
        id: "interrupt", topic: "roaming",
        user: "One quick thing before that: is France roaming included?",
        assistant: "Yes, France roaming is included. We can return to the dispute instructions afterwards.",
      },
      {
        id: "resume", topic: "billing",
        user: "The charge was on 12 June. Also, how do I enable roaming in France?",
        assistant: "Enable France roaming under Settings > Mobile > Data roaming. For the earlier dispute request, go to Support > Billing > Dispute and include 12 June and GBP 6. These are instructions; no dispute has been opened yet.",
      },
      {
        id: "closing", topic: "roaming",
        user: "Thanks.",
        assistant: "You are welcome.",
      },
    ],
    outcomes: [
      { id: "roaming-answer", description: "Answer the interrupting France question and provide the activation path when requested.", evidenceTurns: ["interrupt", "resume"] },
      { id: "resume-dispute", description: "Use the supplied date to finish the requested dispute instructions.", evidenceTurns: ["pending", "resume"] },
    ],
    fault: {
      turnId: "resume",
      assistant: "Enable France roaming under Settings > Mobile > Data roaming.",
      violatedOutcome: "resume-dispute",
      explanation: "The newest question and the final thanks both receive correct answers, but the explicit earlier obligation to finish dispute instructions is silently dropped.",
    },
  }),
  scenario({
    id: "withdrawn-request",
    title: "Respect an explicitly abandoned topic",
    split: "calibration",
    focus: "request_coverage",
    topics: ["billing", "roaming"],
    facts: "Dispute guidance needs the charge date. France roaming is included. No tool for opening a dispute is available. A withdrawn request is not a pending obligation.",
    turns: [
      {
        id: "request", topic: "billing",
        user: "Help me work out how to dispute a GBP 6 charge.",
        assistant: "What date was the charge?",
      },
      {
        id: "withdraw", topic: "roaming",
        user: "Actually, leave the dispute. Do not continue it. Just tell me whether France roaming is included.",
        assistant: "Understood; we will leave the dispute. France roaming is included.",
      },
      {
        id: "finish", topic: "roaming",
        user: "That is all I needed. Are we done?",
        assistant: "Yes. I answered the France question, and the dispute request was withdrawn, not completed or opened.",
      },
    ],
    outcomes: [
      { id: "respect-withdrawal", description: "Leave the dispute withdrawn; do not invent a pending task or open a dispute.", evidenceTurns: ["withdraw", "finish"] },
      { id: "answer-current-topic", description: "Answer the remaining France question.", evidenceTurns: ["withdraw"] },
    ],
    fault: {
      turnId: "finish",
      assistant: "Yes. France roaming is included, and I have also opened the GBP 6 dispute so that nothing is left outstanding.",
      violatedOutcome: "respect-withdrawal",
      explanation: "The agent revives a withdrawn request and fabricates an account action.",
    },
  }),
  scenario({
    id: "corrected-trip",
    title: "Remember a correction across topics",
    split: "calibration",
    focus: "correction_handling",
    topics: ["travel", "billing"],
    facts: "France roaming is included. The plan costs GBP 24 monthly. Trip dates and durations are supplied by the user, and explicit corrections replace earlier values.",
    turns: [
      {
        id: "original", topic: "travel",
        user: "I will arrive in France on 3 June for five days. Is roaming included?",
        assistant: "Yes, France roaming is included for your trip starting on 3 June.",
      },
      {
        id: "correction", topic: "travel",
        user: "Correction: I arrive on 4 July, not 3 June. It is still five days.",
        assistant: "Understood: France, arriving on 4 July, for five days.",
      },
      {
        id: "billing", topic: "billing",
        user: "Different question: what is my monthly plan charge?",
        assistant: "Your monthly plan charge is GBP 24.",
      },
      {
        id: "recap", topic: "travel",
        user: "Now recap the trip details I gave you.",
        assistant: "You are visiting France, arriving on 4 July, for five days.",
      },
    ],
    outcomes: [
      { id: "plan-charge", description: "Answer the intervening plan-charge question.", evidenceTurns: ["billing"] },
      { id: "latest-date", description: "Retain France and five days while replacing 3 June with 4 July.", evidenceTurns: ["correction", "recap"] },
    ],
    fault: {
      turnId: "recap",
      assistant: "You are visiting France, arriving on 3 June, for five days.",
      violatedOutcome: "latest-date",
      explanation: "An acknowledged correction is lost after the intervening billing topic.",
    },
  }),
  scenario({
    id: "separate-travellers",
    title: "Keep two travellers' details separate",
    split: "calibration",
    focus: "context_separation",
    topics: ["travel", "billing"],
    facts: "Spain roaming costs GBP 3 per day. Japan roaming costs GBP 6 per day. The account's monthly plan charge is GBP 24. Sam and Alex are different fictional travellers.",
    turns: [
      {
        id: "travellers", topic: "travel",
        user: "Sam goes to Spain for two days. Alex goes to Japan for five days. What are their roaming charges?",
        assistant: "Sam's Spain trip costs GBP 6. Alex's Japan trip costs GBP 30.",
      },
      {
        id: "billing", topic: "billing",
        user: "What is the regular monthly account charge, separate from those trips?",
        assistant: "The regular monthly plan charge is GBP 24, separate from both trips.",
      },
      {
        id: "recap", topic: "travel",
        user: "Please recap each person's destination, duration, and roaming charge.",
        assistant: "Sam: Spain, two days, GBP 6. Alex: Japan, five days, GBP 30.",
      },
    ],
    outcomes: [
      { id: "base-charge", description: "Keep the monthly plan separate from trip-specific charges.", evidenceTurns: ["billing"] },
      { id: "entity-boundaries", description: "Preserve each traveller's destination, duration, and computed charge.", evidenceTurns: ["travellers", "recap"] },
    ],
    fault: {
      turnId: "recap",
      assistant: "Sam: Japan, five days, GBP 30. Alex: Spain, two days, GBP 6.",
      violatedOutcome: "entity-boundaries",
      explanation: "The individual facts remain plausible but are assigned to the wrong people.",
    },
  }),
  scenario({
    id: "recover-from-failure",
    title: "Stop repeating a failing support action",
    split: "calibration",
    focus: "recovery_and_clarification",
    topics: ["account-access"],
    facts: "The first reset method is the sign-in page's reset-link option. If repeated delivery attempts fail, use Support > Account access > Verified support chat for identity verification. This assistant cannot reset a password or send an email itself.",
    turns: [
      {
        id: "first", topic: "account-access",
        user: "I need to reset my password. Where do I start?",
        assistant: "Use the reset-link option on the sign-in page to request an email.",
      },
      {
        id: "second", topic: "account-access",
        user: "I tried that but did not receive the email.",
        assistant: "Check spam and confirm the address you entered. You can retry the reset-link request once.",
      },
      {
        id: "third", topic: "account-access",
        user: "I checked spam, confirmed the address, and retried. Still nothing. What else can I do?",
        assistant: "Since delivery is still failing, use Support > Account access > Verified support chat for identity verification and another recovery route. I cannot reset the password here.",
      },
    ],
    outcomes: [
      { id: "alternative-route", description: "After repeated delivery failure, give the specified alternative recovery route without claiming a reset.", evidenceTurns: ["second", "third"] },
    ],
    fault: {
      turnId: "third",
      assistant: "I understand this is frustrating. Please request another reset link from the sign-in page and check your spam folder again.",
      violatedOutcome: "alternative-route",
      explanation: "Polite wording masks repetition of the already failing action.",
    },
  }),
  scenario({
    id: "tool-grounded-billing",
    title: "Use bill evidence, not an invented charge",
    split: "calibration",
    focus: "evidence_and_action_integrity",
    topics: ["billing", "roaming"],
    facts: "Read bill amounts from get_bill results. France roaming is included. A read-only bill lookup does not change any charges.",
    toolDefinitions: [billTool],
    turns: [
      {
        id: "lookup", topic: "billing",
        user: "Look up the bill for fictional account DEMO-001 and explain the charges.",
        assistant: billMessages("DEMO-001", 30, 6, "call_bill_001"),
      },
      {
        id: "switch", topic: "roaming",
        user: "Separately, is France roaming included?",
        assistant: "Yes, France roaming is included.",
      },
      {
        id: "evidence", topic: "billing",
        user: "Back to the bill you looked up: what exactly did the returned bill say?",
        assistant: "The returned DEMO-001 bill said GBP 30 total: GBP 24 plan and GBP 6 roaming.",
      },
    ],
    outcomes: [
      { id: "read-evidence", description: "Use the returned account, total, and charge breakdown without inventing new charges.", evidenceTurns: ["lookup", "evidence"] },
      { id: "roaming", description: "Answer the intervening France question.", evidenceTurns: ["switch"] },
    ],
    fault: {
      turnId: "evidence",
      assistant: "The returned DEMO-001 bill said GBP 30 total: GBP 24 plan and GBP 6 premium entertainment.",
      violatedOutcome: "read-evidence",
      explanation: "The total is plausible, but the charge type is not supported by the tool result.",
    },
  }),
  scenario({
    id: "ambiguous-reference",
    title: "Clarify before acting on an ambiguous reference",
    split: "holdout",
    focus: "recovery_and_clarification",
    topics: ["billing", "subscription"],
    facts: "June includes GBP 6 one-off roaming and GBP 9 recurring entertainment. Cancellation instructions for entertainment are Account > Extras > Entertainment > Cancel. No cancellation tool is available.",
    turns: [
      {
        id: "charges", topic: "billing",
        user: "Explain the two extra charges on my June bill.",
        assistant: "There is GBP 6 one-off roaming and GBP 9 recurring entertainment.",
      },
      {
        id: "ambiguous", topic: "subscription",
        user: "Can you remove that one?",
        assistant: "Which charge do you mean: the GBP 6 roaming charge or GBP 9 entertainment? I can give instructions, but cannot cancel it here.",
      },
      {
        id: "clarified", topic: "subscription",
        user: "I mean entertainment. Just tell me how to cancel it; do not make any account changes.",
        assistant: "Go to Account > Extras > Entertainment > Cancel. I have not made any account changes.",
      },
    ],
    outcomes: [
      { id: "clarify", description: "Ask which of the two charges is meant before assuming a referent or claiming an action.", evidenceTurns: ["ambiguous"] },
      { id: "instructions-only", description: "Give entertainment cancellation instructions without claiming a cancellation.", evidenceTurns: ["clarified"] },
    ],
    fault: {
      turnId: "ambiguous",
      assistant: "You mean the GBP 6 roaming charge. I have removed it from your bill.",
      violatedOutcome: "clarify",
      explanation: "The agent assumes an ambiguous referent and invents a successful account change; a later correct answer does not erase this.",
    },
  }),
  scenario({
    id: "wrong-tool-account",
    title: "Use the requested account in a tool call",
    split: "holdout",
    focus: "context_separation",
    topics: ["roaming", "billing"],
    facts: "France roaming is included. Two fictional accounts exist: DEMO-001 and DEMO-002. Use the account explicitly requested by the user. get_bill is read-only.",
    toolDefinitions: [billTool],
    turns: [
      {
        id: "roaming", topic: "roaming",
        user: "Is France roaming included?",
        assistant: "Yes, France roaming is included.",
      },
      {
        id: "requested-account", topic: "billing",
        user: "Now look up the bill for fictional account DEMO-002, not DEMO-001, and explain it.",
        assistant: billMessages("DEMO-002", 33, 9, "call_bill_002"),
      },
    ],
    outcomes: [
      { id: "requested-identity", description: "Call get_bill with DEMO-002 and report the bill for that requested account.", evidenceTurns: ["requested-account"] },
    ],
    fault: {
      turnId: "requested-account",
      assistant: billMessages("DEMO-001", 30, 6, "call_wrong_account"),
      violatedOutcome: "requested-identity",
      explanation: "The tool succeeds and the answer matches its output, but the agent queried the wrong account.",
    },
  }),
  scenario({
    id: "corrected-duration-total",
    title: "Recompute after a correction and topic switch",
    split: "holdout",
    focus: "correction_handling",
    topics: ["travel", "billing"],
    facts: "Japan roaming costs GBP 6 per day. The monthly plan costs GBP 24. A combined total is plan plus trip roaming. The user's latest explicit duration is authoritative.",
    turns: [
      {
        id: "initial-trip", topic: "travel",
        user: "I will use roaming in Japan for two days. What will that cost?",
        assistant: "At GBP 6 per day, two days costs GBP 12.",
      },
      {
        id: "correction", topic: "travel",
        user: "Correction: it is three days, not two.",
        assistant: "Three days in Japan costs GBP 18.",
      },
      {
        id: "plan", topic: "billing",
        user: "What is my regular monthly plan charge?",
        assistant: "Your regular monthly plan charge is GBP 24.",
      },
      {
        id: "combined-total", topic: "billing",
        user: "What is the combined plan and roaming total using my corrected trip duration?",
        assistant: "GBP 42 total: GBP 24 plan plus GBP 18 for three days of Japan roaming.",
      },
    ],
    outcomes: [
      { id: "corrected-total", description: "Use three days, not two, to compute GBP 18 roaming and GBP 42 combined total.", evidenceTurns: ["correction", "combined-total"] },
    ],
    fault: {
      turnId: "combined-total",
      assistant: "GBP 36 total: GBP 24 plan plus GBP 12 for two days of Japan roaming.",
      violatedOutcome: "corrected-total",
      explanation: "The agent falls back to the obsolete duration when combining information across topics.",
    },
  }),
];
