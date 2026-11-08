import { Component, signal, computed, inject, OnInit, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IEventTemplate, IEventLog } from '../interfaces';

interface ICalendarDay {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  logs: IEventLog[];
  templates: IEventTemplate[];
  cycleCounters?: { color: string; dayNumber: number; name: string }[];
}

@Component({
  selector: 'app-event-project-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './project-view.html'
})
export class ProjectViewComponent implements OnInit {
  public readonly tg_chat_id = input.required<string>();
  public readonly project_id = input.required<string>();

  // Сигналы хранилища данных
  public readonly templates = signal<IEventTemplate[]>([]);
  public readonly logs = signal<IEventLog[]>([]);

  // Сигналы навигации по календарю
  public readonly currentYear = signal<number>(new Date().getFullYear());
  public readonly currentMonth = signal<number>(new Date().getMonth()); // 0-11

  // Поля ввода для создания шаблона события
  public templateName = '';
  public templateDesc = '';
  public templateColor = '#EF4444';
  public hasCycleCounter = false;

  public readonly monthName = computed(() => {
    const date = new Date(this.currentYear(), this.currentMonth(), 1);
    return date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
  });

  // Предустановленная палитра цветов для быстрого клика
  public readonly colorPalette = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6'];

  constructor() {
    // Автоматическая синхронизация при изменениях данных
    effect(() => {
      if (this.project_id()) {
        localStorage.setItem(`event_tpls_${this.project_id()}`, JSON.stringify(this.templates()));
      }
    }, { allowSignalWrites: true });

    effect(() => {
      if (this.project_id()) {
        localStorage.setItem(`event_logs_${this.project_id()}`, JSON.stringify(this.logs()));
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.templates.set(JSON.parse(localStorage.getItem(`event_tpls_${this.project_id()}`) || '[]'));
    this.logs.set(JSON.parse(localStorage.getItem(`event_logs_${this.project_id()}`) || '[]'));
  }

  public createTemplate(): void {
    if (!this.templateName.trim()) return;
    const nTpl: IEventTemplate = {
      id: 'tpl_' + Date.now(),
      projectId: this.project_id(),
      name: this.templateName.trim(),
      description: this.templateDesc.trim(),
      color: this.templateColor,
      hasCycleCounter: this.hasCycleCounter
    };
    this.templates.update(prev => [...prev, nTpl]);
    this.templateName = '';
    this.templateDesc = '';
    this.hasCycleCounter = false;
  }

  // Навигация по месяцам
  public prevMonth(): void {
    if (this.currentMonth() === 0) {
      this.currentMonth.set(11);
      this.currentYear.update(y => y - 1);
    } else {
      this.currentMonth.update(m => m - 1);
    }
  }

  public nextMonth(): void {
    if (this.currentMonth() === 11) {
      this.currentMonth.set(0);
      this.currentYear.update(y => y + 1);
    } else {
      this.currentMonth.update(m => m + 1);
    }
  }

  /**
   * КРИТИЧЕСКИЙ РАСЧЕТ: Генерация дней сетки и расчет счетчиков циклов
   */
  public readonly calendarWeeks = computed<ICalendarDay[]>(() => {
    const year = this.currentYear();
    const month = this.currentMonth();
    const allLogs = this.logs();
    const allTpls = this.templates();

    const todayStr = this.formatDate(new Date());

    // 1. Находим границы календаря
    const firstDayOfMonth = new Date(year, month, 1);
    let startDayOfWeek = firstDayOfMonth.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 7 : startDayOfWeek;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: ICalendarDay[] = [];

    // Заполнение дней текущего месяца
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = this.formatDate(d);
      const dayLogs = allLogs.filter(l => l.dateStr === dateStr);
      const dayTemplates = allTpls.filter(t => dayLogs.some(l => l.templateId === t.id));

      days.push({
        dateStr,
        dayNumber: i,
        isCurrentMonth: true,
        logs: dayLogs,
        templates: dayTemplates,
        cycleCounters: [] // Инициализируем пустой массив для счетчиков
      });
    }

    // Добавляем пустые ячейки в начало для выравнивания по дням недели
    const paddingDays = startDayOfWeek - 1;
    for (let i = 0; i < paddingDays; i++) {
      const prevDate = new Date(year, month, -i);
      days.unshift({
        dateStr: this.formatDate(prevDate),
        dayNumber: prevDate.getDate(),
        isCurrentMonth: false,
        logs: [],
        templates: []
      });
    }

    // 2. Расчет счетчиков цикла «Вперед» для каждого активного шаблона
    const cycleTemplates = allTpls.filter(t => t.hasCycleCounter);

    cycleTemplates.forEach(tpl => {
      const tplLogs = allLogs
        .filter(l => l.templateId === tpl.id)
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

      if (tplLogs.length === 0) return;

      days.forEach(day => {
        if (!day.isCurrentMonth) return;
        if (day.dateStr > todayStr) return;

        // Ищем самый свежий лог этого события до текущего дня включительно
        const pastLogs = tplLogs.filter(l => l.dateStr <= day.dateStr);
        if (pastLogs.length === 0) return;

        const latestLogBeforeDay = pastLogs[pastLogs.length - 1];
        const nextLog = tplLogs.find(l => l.dateStr > latestLogBeforeDay.dateStr);

        if (day.dateStr >= latestLogBeforeDay.dateStr && (!nextLog || day.dateStr < nextLog.dateStr)) {
          const startTs = new Date(latestLogBeforeDay.dateStr).getTime();
          const currentTs = new Date(day.dateStr).getTime();
          const diffDays = Math.round((currentTs - startTs) / (1000 * 60 * 60 * 24)) + 1;

          // 🚨 ДОБАВЛЯЕМ СЧЕТЧИК В МАССИВ ДНЯ: Привязываем цвет и имя шаблона
          day.cycleCounters?.push({
            color: tpl.color,
            dayNumber: diffDays,
            name: tpl.name
          });
        }
      });
    });

    return days;
  });

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Удаление шаблона события и всех связанных с ним записей в календаре
   */
  public deleteTemplate(templateId: string, event: Event): void {
    // Останавливаем всплытие клика, чтобы при нажатии на крестик в будущем не триггерились другие события
    event.stopPropagation();

    if (!confirm('Вы уверены, что хотите удалить этот тип события? Все отметки и комментарии на календаре для него будут безвозвратно стерты.')) {
      return;
    }

    // 1. Удаляем сам шаблон события из сигнала
    this.templates.update(prev => prev.filter(t => t.id !== templateId));

    // 2. Каскадно вычищаем все логи/комментарии, привязанные к этому шаблону
    this.logs.update(prev => prev.filter(l => l.templateId !== templateId));

    console.log(`🧹 [Event Project]: Шаблон #${templateId} и его связи успешно удалены из рантайма.`);
  }

}
