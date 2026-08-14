/** فهارس MediaPipe Pose Landmarker (33 نقطة) — نستخدم الأهم منها */
export const LM = {
  nose: 0,
  lEye: 2,
  rEye: 5,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lIndex: 19,
  rIndex: 20,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
  lFoot: 31,
  rFoot: 32,
} as const;

export const TRACKED_PARTS = [
  { key: "head", label: "الرأس", ids: [LM.nose] },
  { key: "shoulders", label: "الأكتاف", ids: [LM.lShoulder, LM.rShoulder] },
  { key: "hands", label: "اليدان", ids: [LM.lWrist, LM.rWrist] },
  { key: "hips", label: "الحوض", ids: [LM.lHip, LM.rHip] },
  { key: "feet", label: "القدمان", ids: [LM.lAnkle, LM.rAnkle] },
] as const;
