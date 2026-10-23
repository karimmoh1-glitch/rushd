// Subject awareness, kept honest: a small per-family config that changes
// question formats, generation instructions and practice copy. Families that
// aren't specialized get the general workflow, and the UI says so.

export type SubjectFamily = "math" | "science" | "humanities" | "social_science" | "language" | "cs" | "general";
export type QuestionFormat = "worked_problem" | "short_answer" | "vocabulary" | "code" | "general";

export interface SubjectProfile {
  family: SubjectFamily;
  label: string;
  format: QuestionFormat;
  specialized: boolean;
  /** Shown above the practice tools. */
  practiceNote: string;
  promptLabel: string;
  promptPlaceholder: string;
  answerLabel: string;
  answerPlaceholder: string;
  /** Placeholder for the student's attempt during a session. */
  attemptPlaceholder: string;
  /** Extra instruction for generated questions (AI path only). */
  generationInstruction: string;
}

const PROFILES: Record<SubjectFamily, SubjectProfile> = {
  math: {
    family: "math",
    label: "Math",
    format: "worked_problem",
    specialized: true,
    practiceNote: "Worked problems: write out each step, then compare your steps with the solution, not just the final answer.",
    promptLabel: "Problem",
    promptPlaceholder: "e.g. Differentiate f(x) = x² sin x",
    answerLabel: "Worked solution",
    answerPlaceholder: "Each step on its own line, ending with the answer",
    attemptPlaceholder: "Work it out step by step",
    generationInstruction: "Write worked problems. The answer is a step-by-step solution, one step per line, ending with the final result.",
  },
  science: {
    family: "science",
    label: "Science",
    format: "worked_problem",
    specialized: true,
    practiceNote: "Worked problems with units: show the setup, the steps, and the units, then compare with the solution.",
    promptLabel: "Problem",
    promptPlaceholder: "e.g. How many moles are in 18 g of water?",
    answerLabel: "Worked solution",
    answerPlaceholder: "Setup, steps with units, and the result",
    attemptPlaceholder: "Show the setup, steps, and units",
    generationInstruction: "Write worked problems or short conceptual questions. Solutions show the setup, each step with units, and the result.",
  },
  humanities: {
    family: "humanities",
    label: "Humanities",
    format: "short_answer",
    specialized: true,
    practiceNote: "Short-answer and explanation questions: answer in a few sentences, then compare your reasoning with the model answer.",
    promptLabel: "Question",
    promptPlaceholder: "e.g. What does the green light symbolize in The Great Gatsby?",
    answerLabel: "Model answer",
    answerPlaceholder: "The key points a good answer would make",
    attemptPlaceholder: "Answer in a few sentences",
    generationInstruction: "Write short-answer questions that ask the student to explain, interpret, or support a claim. The answer lists the key points a strong response makes.",
  },
  social_science: {
    family: "social_science",
    label: "Social sciences",
    format: "short_answer",
    specialized: true,
    practiceNote: "Short-answer and explanation questions: define, explain, and apply, then compare with the model answer's key points.",
    promptLabel: "Question",
    promptPlaceholder: "e.g. Explain how a price ceiling can cause a shortage",
    answerLabel: "Model answer",
    answerPlaceholder: "The key points a good answer would make",
    attemptPlaceholder: "Explain in a few sentences",
    generationInstruction: "Write short-answer questions that ask the student to define, explain, or apply a concept to a scenario. The answer lists the key points.",
  },
  language: {
    family: "language",
    label: "Languages",
    format: "vocabulary",
    specialized: true,
    practiceNote: "Vocabulary and translation prompts: answer from memory before revealing.",
    promptLabel: "Prompt",
    promptPlaceholder: "e.g. Translate: I would have gone if I had known",
    answerLabel: "Answer",
    answerPlaceholder: "The translation or word",
    attemptPlaceholder: "Your translation",
    generationInstruction: "Write vocabulary and short translation prompts (both directions). The answer is the expected translation; mention common acceptable variants in the explanation.",
  },
  cs: {
    family: "cs",
    label: "Computer science",
    format: "code",
    specialized: true,
    practiceNote: "Code and trace questions: predict what code does, or write a short piece of code, then compare with the solution.",
    promptLabel: "Question or code to trace",
    promptPlaceholder: "e.g. What does this print? for i in range(3): print(i * 2)",
    answerLabel: "Solution",
    answerPlaceholder: "The output, or the code, with a short why",
    attemptPlaceholder: "Your output or code",
    generationInstruction: "Write code-tracing questions (what does this print / return) or short code-writing tasks. Put code in the prompt as plain text. The answer gives the output or code and a one-line reason.",
  },
  general: {
    family: "general",
    label: "General",
    format: "general",
    specialized: false,
    practiceNote:
      "Rushd doesn't have a subject-specific practice format for this course yet, so it uses a general question-and-answer workflow.",
    promptLabel: "Question",
    promptPlaceholder: "What do you want to be able to answer?",
    answerLabel: "Answer",
    answerPlaceholder: "The answer you'd want to give",
    attemptPlaceholder: "Your answer",
    generationInstruction: "Write clear questions with concise answers.",
  },
};

// Order matters: "English Language" is humanities, not a language course.
const RULES: [SubjectFamily, RegExp][] = [
  ["humanities", /\b(english|literature|lit\b|composition|writing|rhetoric|history|histor|philosoph|religio|theolog|art|music|theat|film|classics|humanities)/],
  ["cs", /\b(computer|comput|programming|software|coding|data structures?|algorithms?|cs\b|cse\b|machine learning|operating systems?|databases?)/],
  ["math", /\b(math|calculus|calc\b|algebra|geometry|trigonometry|precalc|statistic|stats?\b|discrete|linear|differential|probability|number theory)/],
  ["science", /\b(science|chemistry|chem\b|biology|bio\b|physics|anatomy|physiology|ecology|geology|earth|astronom|environmental|organic|biochem|neuro)/],
  ["language", /\b(spanish|french|german|chinese|mandarin|japanese|korean|latin|arabic|italian|portuguese|russian|hebrew|language|vocab)/],
  ["social_science", /\b(econ|macroecon|microecon|psycholog|sociolog|government|politic|civics|geograph|anthropolog|social|law\b)/],
];

/** The subject family for a course, from its subject and name. */
export function subjectFamily(course: { subject?: string | null; name?: string | null }): SubjectFamily {
  const text = `${course.subject ?? ""} ${course.name ?? ""}`.toLowerCase();
  // An explicit subject decides first; the name only fills in when the subject is missing or unmatched.
  for (const source of [(course.subject ?? "").toLowerCase(), text]) {
    if (!source.trim()) continue;
    for (const [family, pattern] of RULES) {
      if (pattern.test(source)) return family;
    }
  }
  return "general";
}

export function subjectProfile(course: { subject?: string | null; name?: string | null }): SubjectProfile {
  return PROFILES[subjectFamily(course)];
}

export function profileForFamily(family: SubjectFamily): SubjectProfile {
  return PROFILES[family];
}
