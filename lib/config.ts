// Everything personal to your household lives here. Edit freely - names, option
// lists and body parts feed straight into the check-in forms and the insights.

export const WIFE_NAME = "Wife";

export const KIDS = [
  { key: "harvey", name: "Harvey" },
  { key: "leni", name: "Leni" },
  { key: "marshall", name: "Marshall" },
] as const;

export const WIFE_TAGS = [
  { key: "sick", label: "Sick" },
  { key: "flat", label: "Flat" },
  { key: "tired", label: "Tired" },
  { key: "stressed", label: "Stressed" },
  { key: "great", label: "Great" },
] as const;

export const KID_TAGS = [
  { key: "great", label: "Great" },
  { key: "tantrums", label: "Tantrums" },
  { key: "fighting", label: "Fighting" },
  { key: "defiant", label: "Defiant" },
  { key: "clingy", label: "Clingy" },
  { key: "unwell", label: "Unwell" },
] as const;

export const LIFT_FOCUS = ["Push", "Pull", "Legs", "Upper", "Full body"] as const;
export const CARDIO_TYPES = ["Run", "Walk", "Cycle", "Row", "Swim", "HIIT", "Other"] as const;

export const MEDS = [
  { key: "panadol", label: "Panadol" },
  { key: "nurofen", label: "Nurofen" },
  { key: "weightloss", label: "Weight loss" },
  { key: "other", label: "Other" },
] as const;

export const WORK_TYPES = [
  { key: "none", label: "Day off" },
  { key: "wfh", label: "Home" },
  { key: "office", label: "Office" },
] as const;

export const BODY_PARTS = [
  "Head",
  "Neck",
  "Left shoulder",
  "Right shoulder",
  "Upper back",
  "Lower back",
  "Chest",
  "Left elbow",
  "Right elbow",
  "Left wrist / hand",
  "Right wrist / hand",
  "Left hip",
  "Right hip",
  "Left hamstring",
  "Right hamstring",
  "Left quad",
  "Right quad",
  "Left knee",
  "Right knee",
  "Left calf",
  "Right calf",
  "Left ankle / foot",
  "Right ankle / foot",
  "Other",
] as const;

export const SEVERITY_LABELS = ["Niggle", "Mild", "Moderate", "Bad", "Severe"] as const;

export const MOOD_FACES = ["😞", "🙁", "😐", "🙂", "😄"] as const;
export const BEHAVIOUR_FACES = ["😤", "😕", "😐", "🙂", "🥰"] as const;

export const JUNK_LEVELS = ["None", "Some", "A lot"] as const;

export const APP_NAME = "My Day";

// The "day" rolls over at this local hour, so a check-in at 12:30am still
// counts towards the day that just ended.
export const DAY_ROLLOVER_HOUR = 4;
