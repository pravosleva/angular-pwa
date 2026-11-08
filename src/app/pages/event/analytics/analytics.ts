import { Component, signal, computed, inject, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IEventTemplate, IEventLog } from '../interfaces';

interface ICycleStat {
  templateId: string;
  name: string;
  color: string;
  averageDays: number;
  minDays: number;
  maxDays: number;
  history: {
    periodStart: string;
    periodEnd: string;
    durationDays: number;
  }[];
}

@Component({
  selector: 'app-event-analytics',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './analytics.html'
})
export class AnalyticsComponent implements OnInit {
  public readonly tg_chat_id = input.required<string>();
  public readonly project_id = input.required<string>();

  public readonly templates = signal<IEventTemplate[]>([]);
  public readonly logs = signal<IEventLog[]>([]);

  ngOnInit(): void {
    this.templates.set(JSON.parse(localStorage.getItem(`event_tpls_${this.project_id()}`) || '[]'));
    this.logs.set(JSON.parse(localStorage.getItem(`event_logs_${this.project_id()}`) || '[]'));
  }

  /**
   * КРИТИЧЕСКИЙ РАСЧЕТ: Математический анализ цепочек дат для вычисления средних значений
   */
  public readonly cycleStats = computed<ICycleStat[]>(() => {
    const allTpls = this.templates().filter(t => t.hasCycleCounter);
    const allLogs = this.logs();
    const stats: ICycleStat[] = [];

    allTpls.forEach(tpl => {
      // 1. Извлекаем и сортируем по дате все отметки этого шаблона
      const tplLogs = allLogs
        .filter(l => l.templateId === tpl.id)
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

      // Нам нужно минимум 2 даты, чтобы зафиксировать хотя бы один завершенный цикл
      if (tplLogs.length < 2) return;

      const history: ICycleStat['history'] = [];
      let totalDays = 0;
      let minDays = Infinity;
      let maxDays = -Infinity;

      // 2. Ищем последовательные кластеры дат.
      // Если отметки идут подряд (например, 1, 2, 3 ноября) — это ОДИН период (одна менструация).
      // Цикл считается от старта первого периода до старта ВТОРОГО периода.
      const periodStarts: string[] = [];

      for (let i = 0; i < tplLogs.length; i++) {
        if (i === 0) {
          periodStarts.push(tplLogs[i].dateStr);
          continue;
        }

        // Вычисляем разницу со вчерашней отметкой
        const prevTs = new Date(tplLogs[i - 1].dateStr).getTime();
        const currTs = new Date(tplLogs[i].dateStr).getTime();
        const diffDays = Math.round((currTs - prevTs) / (1000 * 60 * 60 * 24));

        // Если разница больше 4 дней — считаем это началом нового полноценного цикла
        if (diffDays > 4) {
          periodStarts.push(tplLogs[i].dateStr);
        }
      }

      if (periodStarts.length < 2) return;

      // 3. Считаем длительность между стартами периодов
      for (let j = 0; j < periodStarts.length - 1; j++) {
        const startTs = new Date(periodStarts[j]).getTime();
        const endTs = new Date(periodStarts[j + 1]).getTime();
        const duration = Math.round((endTs - startTs) / (1000 * 60 * 60 * 24));

        history.push({
          periodStart: periodStarts[j],
          periodEnd: periodStarts[j + 1],
          durationDays: duration
        });

        totalDays += duration;
        if (duration < minDays) minDays = duration;
        if (duration > maxDays) maxDays = duration;
      }

      stats.push({
        templateId: tpl.id,
        name: tpl.name,
        color: tpl.color,
        averageDays: Math.round(totalDays / history.length),
        minDays,
        maxDays,
        history: history.reverse() // Свежие циклы выводим сверху
      });
    });

    return stats;
  });
}
