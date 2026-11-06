import { Component, signal, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, combineLatest } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap, startWith } from 'rxjs/operators';
import {
  // AutoparkUserResponse,
  // CarProject,
  CarItem,
} from '../garage/garage';

/**
 * Расширенные интерфейсы для UI-отображения прогресса износа/сервиса
 */
export interface UICarProcess {
  id: number;
  name: string;
  description: string;
  lastMileage: number;
  deltaMileage: number;
  progressPercent: number; // Вычисляемый рантаймом процент износа/пробега
}

type TJobItem = {
  id: number;
  name: string;
  description: string;
  mileage: {
      last: number;
      delta: number;
  };
}
type TProjectData = {
  name: string;
  description: string;
  items: TJobItem[];
}
type TProjectDataResponse = {
  ok: boolean;
  message?: string;
  projectData?: TProjectData;
}

@Component({
  selector: 'app-car-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-neutral-950 font-sans text-neutral-100 p-4 md:p-8">
      <div class="max-w-xl mx-auto space-y-6">

        <!-- Навигационный бар возврата -->
        <div class="flex items-center gap-2">
          <a [routerLink]="['/autopark', tg_chat_id()]" class="text-xs font-mono text-neutral-400 hover:text-blue-400 transition-colors">
            ← Вернуться в гараж
          </a>
        </div>

        <!-- Загрузчик данных -->
        @if (isLoading()) {
          <div class="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl text-center text-sm font-mono text-blue-400 animate-pulse">
            📡 Чтение сервисной книжки из рантайма бота...
          </div>
        }

        <!-- Основная карточка автомобиля -->
        @if (currentCar(); as car) {
          <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-2">
            <h2 class="text-xl font-bold tracking-tight text-neutral-100">{{ car.name }}</h2>
            <p class="text-sm text-neutral-400 font-mono">{{ car.description || 'Без описания' }}</p>
            <div class="pt-2 flex flex-wrap gap-2 text-[10px] font-mono">
              <span class="bg-neutral-950 border border-neutral-800 px-2 py-1 rounded text-neutral-400">
                ID проекта: {{ project_id() }}
              </span>
            </div>
          </div>

          <!-- Список регламентных работ и процессов -->
          <div class="space-y-4">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono pl-1">
              Мониторинг расходников и ТО ({{ processes().length }})
            </h3>

            <div class="space-y-3">
              @for (process of processes(); track process.id) {
                <div class="p-5 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-md space-y-3">

                  <!-- Шапка процесса -->
                  <div class="flex justify-between items-start">
                    <div class="space-y-1 pr-4">
                      <h4 class="text-sm font-bold text-neutral-200 leading-snug">{{ process.name }}</h4>
                      <p class="text-xs text-neutral-400 leading-relaxed font-sans">{{ process.description }}</p>
                    </div>
                  </div>

                  <!-- Прогресс износа до следующей замены -->
                  <div class="space-y-1.5">
                    <div class="flex justify-between text-[10px] font-mono text-neutral-400">
                      <span>Последнее ТО: {{ process.lastMileage | number }} км</span>
                      <span class="font-bold" [ngClass]="{
                        'text-green-400': process.progressPercent < 70,
                        'text-yellow-400': process.progressPercent >= 70 && process.progressPercent < 90,
                        'text-red-400': process.progressPercent >= 90
                      }">
                        Износ: {{ process.progressPercent }}%
                      </span>
                    </div>

                    <!-- Реактивный термометр-прогрессбар -->
                    <div class="w-full h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                      <div
                        class="h-full transition-all duration-500 rounded-full"
                        [style.width.%]="process.progressPercent > 100 ? 100 : process.progressPercent"
                        [ngClass]="{
                          'bg-green-500': process.progressPercent < 70,
                          'bg-yellow-500': process.progressPercent >= 70 && process.progressPercent < 90,
                          'bg-red-500': process.progressPercent >= 90
                        }"
                      ></div>
                    </div>

                    <div class="text-[9px] font-mono text-neutral-500 text-right">
                      Интервал: +{{ process.deltaMileage | number }} км
                    </div>
                  </div>

                </div>
              } @empty {
                <div class="p-8 bg-neutral-900 border border-neutral-800 border-dashed rounded-2xl text-center text-sm text-neutral-500 font-mono">
                  🔬 Процессы обслуживания для данной машины не зарегистрированы.
                </div>
              }
            </div>
          </div>
        } @else {
          @if (!isLoading()) {
            <div class="p-6 bg-red-950/30 border border-red-900/50 rounded-2xl text-center text-sm font-mono text-red-400">
              ❌ Ошибка рантайма: Автомобиль с ID {{ project_id() }} не найден в вашем гараже.
            </div>
          }
        }

      </div>
    </div>
  `,
  styles: []
})
export class CarDetailsComponent {
  private readonly http = inject(HttpClient);

  /**
   * 1. Входящие сигнальные инпуты от роутера.
   * Благодаря сработавшему флагу withComponentInputBinding(),
   * они автоматически заполняются значениями из пути /autopark/:tg_chat_id/:project_id
   */
  public readonly tg_chat_id = input.required<string>();
  public readonly project_id = input.required<string>();

  // 2. Локальный сигнал для индикации сетевого фетчинга данных
  public readonly isLoading = signal<boolean>(false);

  /**
   * 3. Монолитный реактивный мост (toSignal + toObservable)
   * Объединяет два входящих сигнала в один поток через combineLatest.
   * При изменении любого параметра пути автоматически выполняет запрос check-user.
   */
  private readonly apiResponse = toSignal<TProjectDataResponse>(
    combineLatest([
      toObservable(this.tg_chat_id),
      toObservable(this.project_id)
    ]).pipe(
      debounceTime(50),
      distinctUntilChanged((prev, curr) => prev[0] === curr[0] && prev[1] === curr[1]),
      tap(() => this.isLoading.set(true)),
      switchMap(([chatId, projectId]) => {
        if (!chatId || Number.isNaN(Number(chatId))) {
          return of({ ok: false } as TProjectDataResponse);
        }

        const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/get-data';
        const body = { chat_id: Number(chatId), project_id: Number(projectId) };

        return this.http.post<TProjectDataResponse>(
          apiUrl,
          body,
          { withCredentials: true } // Фиксируем куку jwt на клиенте
        ).pipe(
          catchError((err) => {
            console.error('🚨 [Car Details Net Error]: Не удалось загрузить данные авто:', err);
            return of({ ok: false } as TProjectDataResponse);
          })
        );
      }),
      tap(() => this.isLoading.set(false)),
      // Защищаем компилятор от конфликтов инициализации через startWith и requireSync
      startWith({ ok: false } as TProjectDataResponse)
    ),
    { requireSync: true }
  );

  /**
   * 4. Computed-выражение для хирургического извлечения конкретного авто.
   * Направленный Ациклический Граф (DAG) автоматически пересчитает этот узел,
   * как только изменится ID проекта в URL или прилетит новый ответ от сервера.
   */
  public readonly currentCar = computed<TProjectData | null>(() => {
    const projectsObj = this.apiResponse()?.projectData;
    // const targetId = this.project_id();

    // if (!projectsObj || !targetId || !projectsObj[targetId]) {
    //   return null;
    // }

    return projectsObj || null
  });

  /**
   * 5. Computed-выражение для подготовки списка сервисных процессов.
   * Рассчитывает износ расходников в процентах на лету.
   */
  public readonly processes = computed<UICarProcess[]>(() => {
    const car = this.currentCar();
    if (!car || !car.items) return [];

    return car.items.map((item: CarItem) => {
      // Имитируем текущий пробег автомобиля для расчета износа (например, 310,000 км).
      // В реальном приложении здесь будет чтение общего текущего пробега машины из API.
      const currentVehicleMileage = 310000;

      const last = item.mileage.last;
      const delta = item.mileage.delta || 40000; // Дефолтный интервал ТО

      // Математика рантайма: сколько проехали с момента последнего ТО
      const drivenSinceLastTO = currentVehicleMileage - last;

      // Рассчитываем процент выработки ресурса расходника
      let percent = 0;
      if (drivenSinceLastTO > 0) {
        percent = Math.round((drivenSinceLastTO / delta) * 100);
      }

      return {
        id: item.id,
        name: item.name,
        description: item.description,
        lastMileage: last,
        deltaMileage: delta,
        progressPercent: percent < 0 ? 0 : percent // Защита от отрицательного износа
      };
    });
  });
}
