import Fuse from "fuse.js";

interface FaqEntry {
  question: string;
  answer: string;
}

const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: "What are your opening hours?",
    answer: "Our clinics are open 09:00-17:00, Monday through Friday, across all departments.",
  },
  {
    question: "What departments do you have?",
    answer:
      "We currently have General Medicine, Cardiology, Pediatrics, and Orthopedics. Ask me to book with any of them.",
  },
  {
    question: "How do I book an appointment?",
    answer:
      "I can book one for you right here — just tell me the department or doctor and a preferred day. You can also use the booking form on your dashboard.",
  },
  {
    question: "How do I cancel an appointment?",
    answer: "You can cancel any upcoming appointment from your dashboard's appointment list.",
  },
  {
    question: "Do you offer telemedicine?",
    answer: "Telemedicine video visits are on our roadmap and will appear as a booking option soon.",
  },
  {
    question: "What is a MRN?",
    answer: "MRN stands for Medical Record Number — it's the unique ID assigned to your patient record when you register.",
  },
];

const fuse = new Fuse(FAQ_ENTRIES, { keys: ["question"], threshold: 0.45 });

export function matchFaq(query: string): string | undefined {
  const results = fuse.search(query, { limit: 1 });
  return results[0]?.item.answer;
}
