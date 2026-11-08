export interface IEventProject {
  id: string;
  name: string;
  description?: string;
}

export interface IEventTemplate {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  color: string; // HEX-код цвета (например, '#EF4444')
  hasCycleCounter: boolean;
  breakOnColor?: string; // 🚨 НОВОЕ: HEX-цвет события, которое обрывает этот счетчик
}

export interface IEventLog {
  id: string;
  projectId: string;
  templateId: string;
  dateStr: string; // Формат 'YYYY-MM-DD'
  comment?: string; // Максимум 200 символов
}
