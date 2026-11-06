// src/app/pages/autopark/report/report.component.ts (Часть 1 из 4)
import { Component, signal, computed, inject, input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
// import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Meta, Title } from '@angular/platform-browser'; // Системный SEO-слой Angular
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, combineLatest } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap, startWith } from 'rxjs/operators';
import {
  // AutoparkUserResponse,
  // CarProject,
  CarItem,
} from '../garage/garage';
import { UICarProcess } from '../car-details/car-details';

type TProjectDataResponse = {
  ok: boolean;
  name?: string;
  description?: string;
  report: {
    id: number;
    name: string;
    description: string;
    mileage: {
        delta: number;
        last: number;
    },
    diff: number
  }[];
}

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-neutral-950 font-sans text-neutral-100 p-4 md:p-8">
      <div class="max-w-xl mx-auto space-y-6">

        <!-- Публичный заголовок бланка отчета -->
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl text-center space-y-2">
          <div class="text-[10px] font-mono bg-blue-950/50 border border-blue-900/50 text-blue-400 px-3 py-1 rounded-full inline-block uppercase tracking-wider font-bold">
            📋 Открытый технический отчет системы AutoPark
          </div>

          @if (currentReport(); as car) {
            <h2 class="text-2xl font-black tracking-tight text-neutral-100 mt-2">{{ car.name }}</h2>
            <p class="text-xs text-neutral-400 font-mono">{{ car.description || 'Спецификация не указана' }}</p>
          }
        </div>

        <!-- Индикатор загрузки публичных данных -->
        @if (isLoading()) {
          <div class="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl text-center text-sm font-mono text-blue-400 animate-pulse">
            📡 Чтение публичного среза данных с сервера pravosleva.pro...
          </div>
        }

        <!-- Блок вывода процессов ТО -->
        @if (currentReport()) {
          <div class="space-y-4">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono pl-1">
              Статус выполнения регламентных работ ({{ processes().length }})
            </h3>

            <div class="space-y-3">
              @for (process of processes(); track process.id) {
                <div class="p-5 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-md space-y-3">

                  <div class="flex justify-between items-start">
                    <div class="space-y-1">
                      <h4 class="text-sm font-bold text-neutral-200">{{ process.name }}</h4>
                      <p class="text-xs text-neutral-400">{{ process.description }}</p>
                    </div>
                  </div>

                  <!-- Метрики и Прогресс-бар выработки ресурса -->
                  <div class="space-y-1.5">
                    <div class="flex justify-between text-[10px] font-mono text-neutral-400">
                      <span>Зафиксировано на: {{ process.lastMileage | number }} км</span>
                      <strong [ngClass]="{
                        'text-green-400': process.progressPercent < 70,
                        'text-yellow-400': process.progressPercent >= 70 && process.progressPercent < 90,
                        'text-red-400': process.progressPercent >= 90
                      }">
                        Ресурс выработан на: {{ process.progressPercent }}%
                      </strong>
                    </div>

                    <div class="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
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
                      Регламентный интервал: +{{ process.deltaMileage | number }} км
                    </div>
                  </div>

                </div>
              } @empty {
                <div class="p-8 bg-neutral-900 border border-neutral-800 border-dashed rounded-2xl text-center text-sm text-neutral-500 font-mono">
                  🔬 В открытом доступе нет зарегистрированных процессов ТО для данного авто.
                </div>
              }
            </div>
          </div>
        } @else {
          @if (!isLoading()) {
            <div class="p-6 bg-red-950/30 border border-red-900/50 rounded-2xl text-center text-sm font-mono text-red-400">
              ❌ Запрошенный технический отчет не найден или не существует в системе.
            </div>
          }
        }

        <!-- Дисклеймер в футере бланка -->
        <p class="text-[9px] font-mono text-neutral-600 text-center leading-relaxed pt-4 border-t border-neutral-900">
          *Данная страница сформирована автоматически и является открытой технической выпиской.
          Индексация разрешена. Конфиденциальные данные владельца защищены сквозным шифрованием.
        </p>

      </div>
    </div>
  `,
  styles: []
})
export class ReportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);

  /**
   * 1. Входящие сигнальные инпуты от роутера.
   * Автоматически маппят параметры открытого пути: /autopark/:tg_chat_id/:project_id/report
   */
  public readonly tg_chat_id = input.required<string>();
  public readonly project_id = input.required<string>();

  // 2. Локальный сигнал для индикации сетевого фетчинга данных
  public readonly isLoading = signal<boolean>(false);

  /**
   * 3. Открытый реактивный мост (toSignal + toObservable)
   * Делает прямой запрос за данными БЕЗ флага withCredentials,
   * так как страница является полностью публичной.
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

        // Вызываем публичный эндпоинт check-user
        const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/get-report';
        const body = { chat_id: Number(chatId), project_id: Number(projectId), current_mileage: 305000 };

        return this.http.post<TProjectDataResponse>(apiUrl, body).pipe(
          catchError((err) => {
            console.error('🚨 [Public Report Net Error]: Ошибка фетчинга отчета:', err);
            return of({ ok: false } as TProjectDataResponse);
          })
        );
      }),
      tap(() => this.isLoading.set(false)),
      startWith({ ok: false } as TProjectDataResponse)
    ),
    { requireSync: true }
  );

  /**
   * 4. Инициализация SEO-слоя на старте компонента (Аналог Next.js Head)
   */
  public ngOnInit(): void {
    // В отличие от приватных страниц, здесь мы явно РАЗРЕШАЕМ индексацию роботами
    this.titleService.setTitle('AutoPark | Открытый технический отчет');
    this.meta.addTags([
      { name: 'robots', content: 'index, follow' },
      { name: 'description', content: 'Открытая выписка регламентных работ и статуса технического обслуживания автомобиля в системе AutoPark.' },
      { property: 'og:title', content: 'AutoPark | Открытый технический отчет' },
      { property: 'og:type', content: 'website' }
    ]);
  }

  /**
   * 5. Computed-выражение для извлечения конкретного авто.
   * Направленный Ациклический Граф (DAG) автоматически обновит этот узел,
   * как только изменится ID проекта в URL или прилетит новый ответ от сервера.
   */
  public readonly currentReport = computed<TProjectDataResponse | null>(() => {
    const res = this.apiResponse();
    // const targetId = this.project_id();

    // if (!projectsObj || !targetId || !projectsObj[targetId]) {
    //   return null;
    // }

    // return projectsObj[targetId];

    return res || null
  });

  /**
   * 6. Computed-выражение для расчета прогресса ТО.
   * Вычисляет процент износа расходников на основе дельт пробега для публичного бланка.
   */
  public readonly processes = computed<UICarProcess[]>(() => {
    const car = this.currentReport();
    if (!car) return [];

    return car.report.map((item: CarItem) => {
      // Имитируем текущий пробег автомобиля для расчета износа (например, 310,000 км).
      const currentVehicleMileage = 310000;

      const last = item.mileage.last;
      const delta = item.mileage.delta || 40000;

      const drivenSinceLastTO = currentVehicleMileage - last;

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
        progressPercent: percent < 0 ? 0 : percent
      };
    });
  });

  /**
   * 7. Очистка метатегов при уничтожении компонента.
   * КРИТИЧЕСКИ ВАЖНО: Удаляем публичные метатеги из DOM, чтобы при переходе
   * на приватные страницы /auth/login или /garage роботы не начали их индексировать!
   */
  public ngOnDestroy(): void {
    console.log('🧹 [Public Report SEO]: Очистка метатегов и закрытие поискового контура.');
    this.meta.removeTag("name='robots'");
    this.meta.removeTag("name='description'");
    this.meta.removeTag("property='og:title'");
    this.meta.removeTag("property='og:type'");
  }
}
