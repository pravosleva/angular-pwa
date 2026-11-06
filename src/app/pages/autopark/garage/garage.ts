import { Component, signal, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, startWith, switchMap, tap } from 'rxjs/operators';

/**
 * Строгие интерфейсы данных на основе реального ответа API check-user
 */
export interface CarItem {
  id: number;
  name: string;
  description: string;
  mileage: {
    last: number;
    delta: number;
  };
}

export interface CarProject {
  name: string;
  description: string;
  items: CarItem[];
}

export interface AutoparkUserResponse {
  ok: boolean;
  code?: string;
  projects?: {
    [projectId: string]: CarProject;
  };
}

// Вспомогательный интерфейс для удобного рендеринга списков в шаблоне
export interface UIProjectItem {
  id: string;
  name: string;
  description: string;
  itemsCount: number;
}

@Component({
  selector: 'app-garage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-neutral-950 font-sans text-neutral-100 p-4 md:p-8">
      <div class="max-w-xl mx-auto space-y-6">

        <!-- Заголовок гаража -->
        <div class="flex justify-between items-center bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <div>
            <h2 class="text-xl font-bold text-neutral-100 tracking-tight">Виртуальный гараж</h2>
            <p class="text-xs text-neutral-400 mt-1 font-mono">Владелец (TG ID): #{{ tg_chat_id() }}</p>
          </div>
          <a routerLink="/auth/login" class="text-xs font-mono text-neutral-500 hover:text-red-400 transition-colors">
            Выйти
          </a>
        </div>

        <!-- Сетевой лоадер фетчинга данных -->
        @if (isLoading()) {
          <div class="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl text-center text-sm font-mono text-blue-400 animate-pulse">
            📡 Синхронизация профиля с сервером pravosleva.pro...
          </div>
        }

        <!-- Блок вывода списка машин -->
        <div class="space-y-4">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono pl-1">
            Доступные автомобили ({{ totalCarsCount() }})
          </h3>

          <div class="space-y-3">
            @for (car of uiProjects(); track car.id) {
              <!-- Карточка автомобиля с нативным ленивым роутингом -->
              <div
                [routerLink]="['/autopark', tg_chat_id(), car.id]"
                class="group p-5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-2xl shadow-md transition-all active:scale-[0.99] cursor-pointer flex justify-between items-center"
              >
                <div class="space-y-1">
                  <h4 class="text-base font-bold text-neutral-200 group-hover:text-blue-400 transition-colors">
                    {{ car.name }}
                  </h4>
                  <p class="text-xs text-neutral-400 line-clamp-1 font-mono">{{ car.description || 'Нет описания' }}</p>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs bg-neutral-950 border border-neutral-800 px-2 py-1 rounded-md text-neutral-400 font-mono">
                    Процессов: {{ car.itemsCount }}
                  </span>
                  <span class="text-neutral-600 group-hover:text-neutral-400 transition-colors">→</span>
                </div>
              </div>
            } @empty {
              @if (!isLoading()) {
                <!-- Эффект пустой корзины/гаража -->
                <div class="p-8 bg-neutral-900 border border-neutral-800 border-dashed rounded-2xl text-center space-y-2">
                  <p class="text-sm font-medium text-neutral-400">В вашем гараже пока нет ни одного автомобиля</p>
                  <p class="text-xs text-neutral-500 font-mono">Воспользуйтесь панелью добавления ниже</p>
                </div>
              }
            }
          </div>
        </div>

        <!-- Контейнер для формы создания авто (Шаг 4.2) -->
        <div id="create-car-anchor" class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 class="text-sm font-bold tracking-tight text-neutral-200 font-mono uppercase">
            🛠️ Запустить новый проект авто
          </h3>
          <!-- Сюда будет встроена форма создания из Части 4 -->
          <div class="grid grid-cols-2 gap-4">
  <!-- Селектор Бренда -->
  <div class="flex flex-col">
    <label class="text-[10px] font-mono uppercase text-neutral-400 mb-1">Марка:</label>
    <select [ngModel]="selectedBrand()" (ngModelChange)="onBrandChange($event)" class="bg-neutral-950 border border-neutral-800 p-2 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-blue-500">
      <option value="">Выбрать...</option>
      @for (b of brands(); track b) { <option [value]="b">{{ b }}</option> }
    </select>
  </div>

  <!-- Селектор Модели -->
  <div class="flex flex-col">
    <label class="text-[10px] font-mono uppercase text-neutral-400 mb-1">Модель:</label>
    <select [(ngModel)]="selectedModel" [disabled]="!selectedBrand()" class="bg-neutral-950 border border-neutral-800 p-2 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-blue-500 disabled:opacity-40">
      <option value="">Выбрать...</option>
      @for (m of availableModels(); track m) { <option [value]="m">{{ m }}</option> }
    </select>
  </div>

  <!-- Селектор Трансмиссии -->
  <div class="flex flex-col">
    <label class="text-[10px] font-mono uppercase text-neutral-400 mb-1">Коробка:</label>
    <select [(ngModel)]="selectedTransmission" [disabled]="!selectedModel()" class="bg-neutral-950 border border-neutral-800 p-2 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-blue-500 disabled:opacity-40">
      <option value="">Выбрать...</option>
      @for (t of transmissions(); track t) { <option [value]="t">{{ t }}</option> }
    </select>
  </div>

  <!-- Селектор Года -->
  <div class="flex flex-col">
    <label class="text-[10px] font-mono uppercase text-neutral-400 mb-1">Год выпуска:</label>
    <select [(ngModel)]="selectedYear" [disabled]="!selectedTransmission()" class="bg-neutral-950 border border-neutral-800 p-2 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-blue-500 disabled:opacity-40">
      <option value="">Выбрать...</option>
      @for (y of availableYears(); track y) { <option [value]="y">{{ y }}</option> }
    </select>
  </div>
</div>

<!-- Поле ввода пользовательского имени машины -->
<div class="flex flex-col pt-2">
  <label class="text-[10px] font-mono uppercase text-neutral-400 mb-1">Пользовательское имя (Описание процесса):</label>
  <input type="text" placeholder="Например: Мой любимый Гольф IV" [ngModel]="carCustomName()" (ngModelChange)="carCustomName.set($event)" class="bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-mono" />
</div>

<!-- Кнопка отправки POST-запроса -->
<button (click)="createCarProcess()" [disabled]="!isFormValid() || isSubmitting()" class="w-full mt-2 p-3 bg-green-600 hover:bg-green-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-bold rounded-xl text-xs uppercase tracking-wider font-mono transition-all disabled:cursor-not-allowed">
  @if (isSubmitting()) { <span>📡 Регистрация в рантайме бота...</span> }
  @else { <span>Добавить машину в гараж +</span> }
</button>
        </div>

      </div>
    </div>
  `,
  styles: []
})
export class GarageComponent {
  private readonly http = inject(HttpClient);

  /**
   * 1. Входящий сигнальный инпут от роутера.
   * Angular рантаймом заполнит его значением из пути /autopark/:tg_chat_id
   */
  public readonly tg_chat_id = input.required<string>();

  // 2. Локальный сигнал для отображения состояния фетчинга данных
  public readonly isLoading = signal<boolean>(false);

  /**
   * 3. Монолитный реактивный мост (toSignal + toObservable)
   * Полностью защищен от конфликтов перегрузок статической инициализации.
   */
  private readonly apiResponse = toSignal<AutoparkUserResponse>(
    toObservable(this.tg_chat_id).pipe(
      debounceTime(50),
      distinctUntilChanged(),
      tap(() => this.isLoading.set(true)),
      switchMap((chatId) => {
        if (!chatId || Number.isNaN(Number(chatId))) {
          return of({ ok: false } as AutoparkUserResponse);
        }

        const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/check-user';
        const body = { tg: { chat_id: Number(chatId) } };

        return this.http.post<AutoparkUserResponse>(
          apiUrl,
          body,
          { withCredentials: true }
        ).pipe(
          catchError((err) => {
            console.error('🚨 [Garage Net Error]: Не удалось загрузить автомобили:', err);
            return of({ ok: false } as AutoparkUserResponse);
          })
        );
      }),
      tap(() => this.isLoading.set(false)),
      // Переносим начальное состояние прямо в поток до первого срабатывания экшена
      startWith({ ok: false, projects: {} } as AutoparkUserResponse)
    ),
    // Гарантируем Angular, что сигнал инициализируется синхронно за счет startWith
    { requireSync: true }
  );

  /**
   * 4. Computed-трансформация объекта ответов в плоский массив для циклов шаблона.
   * Полностью избавляет от необходимости писать логику перебора Object.keys() в разметке.
   */
  public readonly uiProjects = computed<UIProjectItem[]>(() => {
    const projectsObj = this.apiResponse()?.projects;
    if (!projectsObj) return [];

    return Object.keys(projectsObj).map((key) => {
      const proj = projectsObj[key];
      return {
        id: key,
        name: proj.name,
        description: proj.description,
        itemsCount: proj.items?.length || 0
      };
    });
  });

  /**
   * 5. Вычисляемый счетчик общего количества машин для заголовков
   */
  public readonly totalCarsCount = computed(() => this.uiProjects().length);

  // =========================================================================
  // 🛠️ СОСТОЯНИЕ ФОРМЫ ДОБАВЛЕНИЯ АВТОМОБИЛЯ (SIGNALS-BASED FORM)
  // =========================================================================

  // Статические списки и буферы данных рантайма
  public readonly brands = signal<string[]>(['Volkswagen', 'Audi', 'BMW', 'Skoda', 'Toyota']);
  public readonly availableModels = signal<string[]>(['Golf', 'Passat', 'A4', 'A6', '3-Series', '5-Series', 'Octavia', 'Camry']);
  public readonly transmissions = signal<string[]>(['MT', 'AT', 'AMT', 'CVT']);

  // Сигналы выбранных полей формы
  public readonly selectedBrand = signal<string>('');
  public readonly selectedModel = signal<string>('');
  public readonly selectedTransmission = signal<string>('');
  public readonly selectedYear = signal<string>('');
  public readonly carCustomName = signal<string>('');

  // Состояние отправки формы
  public readonly isSubmitting = signal<boolean>(false);

  /**
   * Динамический диапазон годов (зависит от выбранной модели).
   * Имитируем перебор рантайма на основе прилетевших данных API.
   */
  public readonly availableYears = computed<string[]>(() => {
    if (!this.selectedModel()) return [];
    // Генерируем массив годов от 2000 до 2026 для каскадного селектора
    const currentYear = 2026;
    const years: string[] = [];
    for (let y = currentYear; y >= 2000; y--) {
      years.push(String(y));
    }
    return years;
  });

  /**
   * Граф вычислений валидности формы (DAG).
   * Автоматически высчитывает состояние кнопки отправки "на лету".
   */
  public readonly isFormValid = computed<boolean>(() => {
    return !!(
      this.selectedBrand() &&
      this.selectedModel() &&
      this.selectedTransmission() &&
      this.selectedYear() &&
      this.carCustomName().trim().length > 2
    );
  });

  /**
   * Каскадный перехватчик смены бренда.
   * Очищает нижележащие зависимые сигналы графа для предотвращения отправки невалидных данных.
   */
  public onBrandChange(brand: string): void {
    this.selectedBrand.set(brand);
    this.selectedModel.set('');
    this.selectedTransmission.set('');
    this.selectedYear.set('');
  }

  /**
   * Отправка запроса на создание нового автомобиля
   */
  public createCarProcess(): void {
    if (!this.isFormValid() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    console.log('📡 [Garage Form]: Инициализирована сборка структуры автомобиля...');

    // Компонуем имя машины по правилам платформы Autopark
    const formattedProjectName = `${this.selectedBrand()} ${this.selectedModel()}, ${this.selectedTransmission()}, ${this.selectedYear()}`;

    const body = {
      chat_id: Number(this.tg_chat_id()),
      project: {
        name: formattedProjectName,
        description: this.carCustomName().trim()
      }
    };

    // Имитируем отправку payload на сервер pravosleva.pro
    setTimeout(() => {
      console.log('🟢 [Garage Form]: Автомобиль успешно добавлен в базу данных бота. Тело:', body);

      // Сбрасываем форму после успешной операции
      this.carCustomName.set('');
      this.selectedBrand.set('');
      this.selectedModel.set('');
      this.selectedTransmission.set('');
      this.selectedYear.set('');

      this.isSubmitting.set(false);

      // Настоящий вызов в следующем шаге сделает перезапрос: window.location.reload() или обновление сигнала
    }, 800);
  }
}
