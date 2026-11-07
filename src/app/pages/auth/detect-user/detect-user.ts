import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-detect-user',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col justify-center items-center min-h-screen bg-neutral-950 font-sans p-4 text-white">
      <div class="w-full max-w-xs bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">

        <div class="text-center mb-6">
          <h3 class="text-lg font-bold tracking-tight text-neutral-100">Инициализация сессии</h3>
          <p class="text-xs text-neutral-400 mt-1">Для доступа к приватной панели введите ваш ID</p>
        </div>

        <div class="space-y-4">
          <div class="flex flex-col">
            <label for="chatId" class="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2 font-mono">
              Telegram Chat ID:
            </label>
            <input
              id="chatId"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="Например: 432590698"
              [ngModel]="chatIdInput()"
              (ngModelChange)="chatIdInput.set($event)"
              class="w-full text-center text-lg p-3 bg-neutral-950 border border-neutral-800 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-white transition-colors"
            />
          </div>

          <button
            (click)="proceedToProject()"
            [disabled]="!isFormValid()"
            class="w-full p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-medium rounded-xl text-sm tracking-wide font-mono transition-all active:scale-[0.98] disabled:active:scale-100"
          >
            Открыть панель →
          </button>
        </div>

        <p class="text-[10px] font-mono text-neutral-500 text-center mt-6 leading-relaxed">
          *ID можно получить, запустив официального Telegram-бота экосистемы.
        </p>
      </div>
    </div>
  `
})
export class DetectUserComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  public readonly chatIdInput = signal<string>('');

  // Извлекаем, куда пользователь шел изначально (например: "/autopark" или "/event")
  public readonly targetProjectFrom = computed(() => {
    return this.route.snapshot.queryParamMap.get('from') || '/autopark';
  });

  public readonly isFormValid = computed(() => {
    const id = this.chatIdInput().trim();
    return id.length > 0 && !Number.isNaN(Number(id));
  });

  ngOnInit(): void {
    // Умный фолбек: пытаемся подставить последний успешный ID из localStorage
    const lastSavedChatId = localStorage.getItem('last_detected_chat_id');
    if (lastSavedChatId) {
      this.chatIdInput.set(lastSavedChatId);
    }
  }

  public proceedToProject(): void {
    if (!this.isFormValid()) return;

    const cleanedId = this.chatIdInput().trim();

    // Сохраняем ID для будущих сессий
    localStorage.setItem('last_detected_chat_id', cleanedId);

    // Парсим базовый путь (например, "/autopark" или "/event")
    const rawTarget = decodeURIComponent(this.targetProjectFrom());
    const cleanTarget = rawTarget.split('?')[0]; // отсекаем старые query-параметры если были

    // Собираем новый путь: "from/:chat_id" -> ['autopark', '432590698']
    const segments = [...cleanTarget.split('/'), cleanedId].filter(p => p.trim().length > 0);

    console.log(`🚀 [Detect User]: Перенаправление на проектную ветку:`, segments);
    this.router.navigate(segments);
  }
}
