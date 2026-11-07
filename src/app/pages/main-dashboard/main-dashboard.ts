import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-main-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-neutral-950 font-sans text-neutral-100 p-6 md:p-12 flex flex-col justify-center items-center">
      <div class="w-full max-w-2xl space-y-8">

        <!-- Шапка общей экосистемы -->
        <div class="text-center space-y-2">
          <h1 class="text-3xl font-black tracking-tight text-white sm:text-4xl bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Pravosleva Hub
          </h1>
          <p class="text-sm text-neutral-400 max-w-sm mx-auto font-mono">
            Единая консоль управления персональными рантайм-сервисами
          </p>
        </div>

        <!-- Сетка доступных подпроектов -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <!-- Карточка: Автопарк -->
          <div [routerLink]="getProjectRoute('/autopark')"
               class="group p-6 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-2xl shadow-xl transition-all cursor-pointer flex flex-col justify-between h-48 active:scale-[0.99]">
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <span class="text-2xl">🚗</span>
                <span class="text-[10px] font-mono uppercase bg-blue-950 border border-blue-800 text-blue-400 px-2 py-0.5 rounded">v2022</span>
              </div>
              <h3 class="text-lg font-bold text-neutral-200 group-hover:text-blue-400 transition-colors">AutoPark</h3>
              <p class="text-xs text-neutral-400 font-mono leading-relaxed line-clamp-2">
                Мониторинг процессов ТО, учет регламентных замен и кастомный аудит узлов автомобиля.
              </p>
            </div>
            <div class="flex items-center justify-between text-xs font-mono text-neutral-500 group-hover:text-neutral-300 pt-4 border-t border-neutral-800/40">
              <span>{{ hasSavedId() ? 'Открыть ваш гараж' : 'Требуется ID' }}</span>
              <span>→</span>
            </div>
          </div>

          <!-- Карточка: Менеджер Событий (Новый проект) -->
          <div [routerLink]="getProjectRoute('/event')"
               class="group p-6 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-2xl shadow-xl transition-all cursor-pointer flex flex-col justify-between h-48 active:scale-[0.99]">
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <span class="text-2xl">📅</span>
                <span class="text-[10px] font-mono uppercase bg-purple-950 border border-purple-800 text-purple-400 px-2 py-0.5 rounded">Active</span>
              </div>
              <h3 class="text-lg font-bold text-neutral-200 group-hover:text-purple-400 transition-colors">Event Manager</h3>
              <p class="text-xs text-neutral-400 font-mono leading-relaxed line-clamp-2">
                Планирование графиков, менеджмент участников и логирование событий в реальном времени.
              </p>
            </div>
            <div class="flex items-center justify-between text-xs font-mono text-neutral-500 group-hover:text-neutral-300 pt-4 border-t border-neutral-800/40">
              <span>{{ hasSavedId() ? 'Перейти к событиям' : 'Требуется ID' }}</span>
              <span>→</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  `
})
export class MainDashboardComponent implements OnInit {
  public readonly savedChatId = signal<string | null>(null);
  public readonly hasSavedId = signal<boolean>(false);

  ngOnInit(): void {
    const id = localStorage.getItem('last_detected_chat_id');
    if (id) {
      this.savedChatId.set(id);
      this.hasSavedId.set(true);
    }
  }

  /**
   * Динамическое определение маршрута.
   * Если ID известен — сразу шлем в целевой раздел, если нет — на шлюз детекции.
   */
  public getProjectRoute(basePath: string): string[] {
    const currentId = this.savedChatId();
    if (currentId) {
      return [basePath, currentId];
    }
    // Перенаправляем на универсальный детектор, передавая контекст исходного проекта
    return ['/auth/detect-user'];
  }
}
