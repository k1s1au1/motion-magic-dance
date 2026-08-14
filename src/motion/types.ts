export type Vec = { x: number; y: number };

export type Landmark = { x: number; y: number; z: number; visibility?: number };
export type Landmarks = Landmark[];

/** لحظات الحركة التي ترسلها الكاميرا كأحداث (Edge events) */
export type MotionEventType =
  | "punchLeft"
  | "punchRight"
  | "jump"
  | "squat"
  | "moveLeft"
  | "moveRight"
  | "center"
  | "handsUp";

export type MotionEvent = { type: MotionEventType; t: number; power: number };

/**
 * مدخلات الحركة الموحّدة التي تستهلكها كل الألعاب.
 * كل الإحداثيات في "فضاء اللاعب" (Player space) 0..1:
 * x يزيد ناحية يمين اللاعب الحقيقي، y يزيد للأسفل.
 * لا يوجد أي انعكاس Mirror على عالم اللعبة أو الواجهة.
 */
export type MotionInput = {
  tracked: boolean;
  confidence: number;
  /** يد اللاعب اليسرى الحقيقية (تبقى يساراً دائماً) */
  handLeft: Vec;
  handRight: Vec;
  handLeftVel: Vec;
  handRightVel: Vec;
  /** مركز الجسم في فضاء اللعبة */
  body: Vec;
  bodyVel: Vec;
  head: Vec;
  /** ميلان الجذع -1..1 */
  lean: number;
  /** -1 يسار، 0 وسط، 1 يمين */
  lane: -1 | 0 | 1;
  squat: boolean;
  jump: boolean;
  handsUp: boolean;
  /** سرعة الذراعين 0..1 */
  armVelocity: number;
  bodyVelocity: number;
  /** طاقة الحركة العامة 0..1 */
  energy: number;
  /** مقياس الجسم (عرض الأكتاف) — يجعل كل شيء مستقلاً عن البُعد */
  scale: number;
};

export type CalibrationState = {
  /** الجسم كامل داخل الإطار */
  bodyInFrame: boolean;
  head: boolean;
  shoulders: boolean;
  hands: boolean;
  hips: boolean;
  feet: boolean;
  steady: boolean;
  /** 0..1 */
  progress: number;
  ready: boolean;
};

export function emptyInput(): MotionInput {
  return {
    tracked: false,
    confidence: 0,
    handLeft: { x: 0.3, y: 0.5 },
    handRight: { x: 0.7, y: 0.5 },
    handLeftVel: { x: 0, y: 0 },
    handRightVel: { x: 0, y: 0 },
    body: { x: 0.5, y: 0.5 },
    bodyVel: { x: 0, y: 0 },
    head: { x: 0.5, y: 0.35 },
    lean: 0,
    lane: 0,
    squat: false,
    jump: false,
    handsUp: false,
    armVelocity: 0,
    bodyVelocity: 0,
    energy: 0,
    scale: 0.2,
  };
}
