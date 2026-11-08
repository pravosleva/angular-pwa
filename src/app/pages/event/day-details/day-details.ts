import { Component, signal, computed, inject, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IEventTemplate, IEventLog } from '../interfaces';

@Component({
  selector: 'app-event-day-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-neutral-950 font-sans text-neutral-100 p-4 md:p-8">
      <div class="max-w-xl mx-auto space-y-6">

        <div class="flex items-center justify-between">
          <a [routerLink]="['/event', tg_chat_id(), project_id()]" class="text-xs font-mono text-neutral-400 hover:text-purple-400 transition-colors">← Назад к календарю</a>
          <span class="text-xs font-mono text-purple-400 font-bold bg-neutral-900 px-3 py-1 border border-neutral-800 rounded-xl">{{ date() }}</span>
        </div>

        <!-- Секция легенды и выбора событий -->
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 class="text-sm font-bold tracking-tight text-neutral-200 font-mono uppercase">События в этот день</h3>

          <div class="space-y-3">
            @for (tpl of templates(); track tpl.id) {
              <div class="flex items-center justify-between bg-neutral-950 border border-neutral-850 p-4 rounded-xl">
                <div class="flex items-center gap-3">
                  <!-- Цветной индикатор легенды -->
                  <div [style.backgroundColor]="tpl.color" class="w-4 h-4 rounded-full ring-2 ring-black/40"></div>
                  <div>
                    <span class="text-sm font-bold text-neutral-200">{{ tpl.name }}</span>
                    @if (tpl.hasCycleCounter) {
                      <span class="text-[9px] font-mono text-purple-400 border border-purple-900/50 px-1.5 py-0.5 ml-2 rounded bg-purple-950/20">Цикличное</span>
                    }
                  </div>
                </div>

                <!-- Кнопка включения/выключения события для этого дня -->
                <button (click)="toggleEvent(tpl.id)"
                        [class.bg-purple-600]="isEventLogged(tpl.id)"
                        [class.bg-neutral-800]="!isEventLogged(tpl.id)"
                        class="px-3 py-1.5 font-mono text-xs font-bold rounded-lg transition-all active:scale-95 text-white">
                  {{ isEventLogged(tpl.id) ? 'Отмечено ✓' : 'Добавить' }}
                </button>
              </div>
            } @empty {
              <p class="text-xs text-neutral-500 font-mono text-center py-4">Сначала создайте шаблоны событий на странице календаря.</p>
            }
          </div>
        </div>

        <!-- Текстовые логи и комментарии для активных событий -->
        @if (dayLogs().length > 0) {
          <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 class="text-sm font-bold tracking-tight text-neutral-200 font-mono uppercase">Журнал комментариев (макс. 200 симв.)</h3>

            <div class="space-y-4">
              @for (log of dayLogs(); track log.id) {
                <div class="space-y-1.5 bg-neutral-950 p-4 border border-neutral-850 rounded-xl">
                  <div class="flex items-center gap-2">
                    <div [style.backgroundColor]="getTemplateColor(log.templateId)" class="w-2.5 h-2.5 rounded-full"></div>
                    <span class="text-xs font-bold font-mono text-neutral-300">{{ getTemplateName(log.templateId) }}</span>
                  </div>

                  <textarea
                    maxLength="200"
                    placeholder="Добавить примечание или симптомы..."
                    [ngModel]="log.comment || ''"
                    (ngModelChange)="updateComment(log.id, $event)"
                    class="w-full bg-neutral-900 border border-neutral-800 p-2.5 rounded-xl text-xs focus:outline-none focus:border-purple-500 font-mono text-white h-16 resize-none"
                  ></textarea>
                  <div class="text-[10px] text-neutral-500 font-mono text-right">
                    {{ (log.comment || '').length }}/200
                  </div>
                </div>
              }
            </div>
          </div>
        }

      </div>
    </div>
  `
})
export class DayDetailsComponent implements OnInit {
  public readonly tg_chat_id = input.required<string>();
  public readonly project_id = input.required<string>();
  public readonly date = input.required<string>(); // Юрл-параметр YYYY-MM-DD

  public readonly templates = signal<IEventTemplate[]>([]);
  public readonly allLogs = signal<IEventLog[]>([]);

  // Логи исключительно для текущего выбранного дня
  public readonly dayLogs = computed(() => {
    return this.allLogs().filter(l => l.dateStr === this.date());
  });

  ngOnInit(): void {
    this.templates.set(JSON.parse(localStorage.getItem(`event_tpls_${this.project_id()}`) || '[]'));
    this.allLogs.set(JSON.parse(localStorage.getItem(`event_logs_${this.project_id()}`) || '[]'));
  }

  public isEventLogged(templateId: string): boolean {
    return this.dayLogs().some(l => l.templateId === templateId);
  }

  public toggleEvent(templateId: string): void {
    const existingLog = this.dayLogs().find(l => l.templateId === templateId);

    if (existingLog) {
      // Удаляем если уже было
      const updated = this.allLogs().filter(l => l.id !== existingLog.id);
      this.allLogs.set(updated);
    } else {
      // Добавляем новую запись
      const newLog: IEventLog = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        projectId: this.project_id(),
        templateId,
        dateStr: this.date(),
        comment: ''
      };
      this.allLogs.update(prev => [...prev, newLog]);
    }
    this.save();
  }

  public updateComment(logId: string, text: string): void {
    const truncatedText = text.substring(0, 200); // Страховка лимита
    this.allLogs.update(prev =>
      prev.map(l => l.id === logId ? { ...l, comment: truncatedText } : l)
    );
    this.save();
  }

  // Вспомогательные хелперы маппинга легенды
  public getTemplateName(templateId: string): string {
    return this.templates().find(t => t.id === templateId)?.name || 'Событие';
  }

  public getTemplateColor(templateId: string): string {
    return this.templates().find(t => t.id === templateId)?.color || '#6B7280';
  }

  private save(): void {
    localStorage.setItem(`event_logs_${this.project_id()}`, JSON.stringify(this.allLogs()));
  }
}
