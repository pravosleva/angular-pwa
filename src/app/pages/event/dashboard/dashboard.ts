import { Component, signal, computed, inject, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IEventProject } from '../interfaces';

@Component({
  selector: 'app-event-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-neutral-950 font-sans text-neutral-100 p-4 md:p-8">
      <div class="max-w-xl mx-auto space-y-6">

        <div class="flex items-center justify-between">
          <a [routerLink]="['/']" class="text-xs font-mono text-neutral-400 hover:text-purple-400 transition-colors">← Hub</a>
          <span class="text-xs font-mono text-neutral-500">Пользователь: #{{ tg_chat_id() }}</span>
        </div>

        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <h2 class="text-xl font-bold text-neutral-100 tracking-tight">Менеджер Событий</h2>
          <p class="text-xs text-neutral-400 mt-1">Автономное отслеживание циклов и логов</p>
        </div>

        <!-- Список проектов -->
        <div class="space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono pl-1">Ваши проекты</h3>

          @for (p of projects(); track p.id) {
            <div [routerLink]="['/event', tg_chat_id(), p.id]"
                 class="group p-5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-purple-900/50 rounded-2xl shadow-md transition-all active:scale-[0.99] cursor-pointer flex justify-between items-center">
              <div>
                <h4 class="text-base font-bold text-neutral-200 group-hover:text-purple-400 transition-colors">{{ p.name }}</h4>
                <p class="text-xs text-neutral-400 font-mono mt-1">{{ p.description || 'Без описания' }}</p>
              </div>
              <span class="text-neutral-600 group-hover:text-purple-400 transition-colors font-bold font-mono">→</span>
            </div>
          } @empty {
            <div class="p-8 bg-neutral-900 border border-neutral-800 border-dashed rounded-2xl text-center text-sm text-neutral-500 font-mono">
              У вас пока нет созданных проектов событий.
            </div>
          }
        </div>

        <!-- Форма создания проекта -->
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 class="text-sm font-bold tracking-tight text-neutral-200 font-mono uppercase">Новый проект</h3>
          <div class="space-y-3">
            <input type="text" placeholder="Название (например: Здоровье)" [(ngModel)]="newName"
                   class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-sm focus:outline-none focus:border-purple-500 font-mono text-white" />
            <input type="text" placeholder="Описание проекта" [(ngModel)]="newDesc"
                   class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-sm focus:outline-none focus:border-purple-500 font-mono text-white" />
            <button (click)="createProject()" [disabled]="!newName.trim()"
                    class="w-full p-3 bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-bold rounded-xl text-xs uppercase tracking-wider font-mono transition-all">
              Создать проект +
            </button>
          </div>
        </div>

      </div>
    </div>
  `
})
export class EventDashboardComponent implements OnInit {
  public readonly tg_chat_id = input.required<string>();
  public readonly projects = signal<IEventProject[]>([]);

  public newName = '';
  public newDesc = '';

  ngOnInit(): void {
    const key = `event_projects_${this.tg_chat_id()}`;
    this.projects.set(JSON.parse(localStorage.getItem(key) || '[]'));
  }

  public createProject(): void {
    if (!this.newName.trim()) return;
    const newProj: IEventProject = {
      id: String(Date.now()),
      name: this.newName.trim(),
      description: this.newDesc.trim()
    };
    const updated = [...this.projects(), newProj];
    this.projects.set(updated);
    localStorage.setItem(`event_projects_${this.tg_chat_id()}`, JSON.stringify(updated));
    this.newName = '';
    this.newDesc = '';
  }
}
