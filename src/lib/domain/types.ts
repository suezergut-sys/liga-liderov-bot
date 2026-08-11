export type TeamColor = "red" | "blue";

export type TeamStatus =
  | "waiting"
  | "awaiting-decision"
  | "decision-selected"
  | "awaiting-file"
  | "ready"
  | "completed";

export type DecisionSource = "captain" | "organizer_override";

export interface Choice {
  id: string;
  label: string;
  result?: string;
}

export interface ScenarioStage {
  id: string;
  title: string;
  situation: string;
  choices: Choice[];
  /** После подтверждения этого шага команда должна перейти к загрузке файла. */
  fileRequired: boolean;
}

export interface DecisionRecord {
  stageIndex: number;
  stageId: string;
  choiceId: string;
  source: DecisionSource;
  confirmedAt: string;
  fileName?: string;
  fileUrl?: string;
  fileMissingOnForcedAdvance?: boolean;
}

export interface DeliveryState {
  status: "not-sent" | "sent" | "failed";
  at?: string;
  error?: string;
}

export interface TeamState {
  id: string;
  number: number;
  name: string;
  color: TeamColor;
  botKey: string;
  captainTelegramUserId?: string;
  captainChatId?: string;
  status: TeamStatus;
  currentStageIndex: number;
  selectedChoiceId?: string;
  selectedSource?: DecisionSource;
  decisionConfirmedAt?: string;
  currentFileName?: string;
  currentFileUrl?: string;
  lastActivityAt?: string;
  delivery: DeliveryState;
  history: DecisionRecord[];
}

export interface GameState {
  status: "waiting" | "running" | "completed";
  currentStageIndex: number;
  stageOpenedAt?: string;
  deadlineAt?: string;
  durationSeconds: number;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: "captain" | "organizer" | "system";
  action: string;
  teamId?: string;
  details?: Record<string, unknown>;
}

export interface GameSnapshot {
  game: GameState;
  teams: TeamState[];
  audit: AuditEvent[];
  serverNow: string;
  demoMode: boolean;
}
