import { Component, signal, computed, inject, input, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Meta, Title } from '@angular/platform-browser'; // Системный SEO-слой Angular
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, combineLatest } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap, startWith } from 'rxjs/operators';
// import { CarItem } from '../garage/garage';
import { UICarProcess } from '../car-details/car-details';
import { RouterLink } from '@angular/router';

/**
 * Строгий интерфейс ответа от публичного API отчетов get-report
 */
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
  imports: [CommonModule, RouterLink],
  templateUrl: './report.html',
  styles: []
})
export class ReportComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);

  /**
   * 1. Входящие сигнальные инпуты от роутера.
   * Автоматически маппят параметры открытого пути: /autopark/:tg_chat_id/:project_id/report
   */
  public readonly tg_chat_id = input.required<string>();
  public readonly project_id = input.required<string>();

  // 2. Локальные сигналы индикации состояния
  public readonly isLoading = signal<boolean>(false);

  // 🔥 Реактивный сигнал пробега, изолированный под текущий project_id
  public readonly currentVehicleMileage = signal<number>(0);

  constructor() {
    /**
     * 🔥 НОВОЕ: Автоматическое восстановление пробега для конкретной машины.
     * Запускается при инициализации project_id() и считывает изолированный ключ.
     */
    effect(() => {
      const pid = this.project_id();
      if (pid) {
        const localData = localStorage.getItem(`autopark_mileage_${pid}`);
        // Фолбек на 10000, если машина открывается впервые без сохраненного пробега
        this.currentVehicleMileage.set(localData ? Number(localData) : 10000);
      }
    }, { allowSignalWrites: true });
  }

  /**
   * 3. Открытый реактивный мост (toSignal + toObservable)
   * 🔥 ОБНОВЛЕНО: combineLatest теперь слушает и сигнал пробега,
   * автоматически перезапуская POST-запрос при обновлении localStorage!
   */
  private readonly apiResponse = toSignal<TProjectDataResponse>(
    combineLatest([
      toObservable(this.tg_chat_id),
      toObservable(this.project_id),
      toObservable(this.currentVehicleMileage) // Отслеживаем живой пробег
    ]).pipe(
      debounceTime(50),
      distinctUntilChanged((prev, curr) =>
        prev[0] === curr[0] && prev[1] === curr[1] && prev[2] === curr[2]
      ),
      tap(() => this.isLoading.set(true)),
      switchMap(([chatId, projectId, mileage]) => {
        if (!chatId || Number.isNaN(Number(chatId))) {
          return of({ ok: false } as TProjectDataResponse);
        }

        const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/get-report';

        // 🔥 Передаем актуальный пробег из localStorage прямо в payload бэкенда!
        const body = {
          chat_id: Number(chatId),
          project_id: Number(projectId),
          current_mileage: mileage
        };

        console.log(`📡 [Public Report API]: Запрос отчета для авто #${projectId} с пробегом ${mileage} км...`);

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
    // ЯВНО РАЗРЕШАЕМ индексацию роботами технического отчета
    this.titleService.setTitle('AutoPark | Открытый технический отчет');
    this.meta.addTags([
      { name: 'robots', content: 'index, follow' },
      { name: 'description', content: 'Открытая выписка регламентных работ и статуса технического обслуживания автомобиля в системе AutoPark.' },
      { property: 'og:title', content: 'AutoPark | Открытый технический отчет' },
      { property: 'og:type', content: 'website' }
    ]);
  }

  /**
   * 5. Computed-выражение для извлечения конкретного отчета.
   */
  public readonly currentReport = computed<TProjectDataResponse | null>(() => {
    return this.apiResponse() || null;
  });

  /**
   * 6. Computed-выражение для расчета прогресса ТО.
   * 🔥 ОБНОВЛЕНО: Вычисляет процент износа расходников на основе ЖИВОГО сигнала пробега
   */
  public readonly processes = computed<UICarProcess[]>(() => {
    const car = this.currentReport();
    if (!car || !car.report) return [];

    // Читаем живой пробег из сигнала, восстановленный из localStorage
    const currentVehicleMileage = this.currentVehicleMileage();

    return car.report.map((item: any) => {
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
   * КРИТИЧЕСКИ ВАЖНО: Удаляем публичные метатеги из DOM, чтобы поисковые
   * роботы не проиндексировали приватный контур приложения при переходах!
   */
  public ngOnDestroy(): void {
    console.log('🧹 [Public Report SEO]: Очистка метатегов и закрытие поискового контура.');
    this.meta.removeTag("name='robots'");
    this.meta.removeTag("name='description'");
    this.meta.removeTag("property='og:title'");
    this.meta.removeTag("property='og:type'");
  }
}
