import { Component, signal, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, combineLatest } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap, tap } from 'rxjs/operators';
import { AutoparkStoreService } from '../../../services/autopark-store.service';

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

type BrandModelsResponse = {
  ok: boolean;
  models: string[];
  byUremont: {
    success: 0|1;
    models: {
      id: number;
      name: string;
      mark_id: number;
      sort_id: number;
      rating: number;
      is_seo_active: number;
      rgs_code: unknown,
      generations: {
        id: number;
        mark_name: string;
        model_name: string;
        generation_name: string;
        start_year: number;
        finish_year: number | null;
        image: string;
        images: [
          {
            id: number;
            thumb_140_140: string;
            thumb_34_34: string;
            file_url: string;
          }
        ]
      }[];
    }[];
  }
}

export interface UIGenerationItem {
  id: number;
  name: string;      // Название поколения, например: "III (F40)"
  yearsRange: string; // Строка годов, например: "(2019 - н.в.)"
  imageUrl: string | null; // Ссылка на миниатюру картинки с S3 Uremont
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
  templateUrl: './garage.html',
  styles: []
})
export class GarageComponent {
  // Сигнал-модификатор версии для принудительного обновления потока
  private readonly refreshTrigger = signal<number>(0);

  // 1. Внедряем системные зависимости и наш глобальный стор-синглтон
  private readonly http = inject(HttpClient);
  private readonly store = inject(AutoparkStoreService);

  /**
   * 2. Входящий сигнальный инпут от роутера.
   * Благодаря сработавшему флагу withComponentInputBinding(),
   * Angular рантаймом автоматически заполнит его значением из пути /autopark/:tg_chat_id
   */
  public readonly tg_chat_id = input.required<string>();
  public readonly isLoading = signal<boolean>(false);

  /**
   * 3. Умный реактивный мост с поддержкой глобального кэша и триггера обновления
   * Синхронизирует данные при изменении URL или принудительном инкременте версии формы
   */
  private readonly apiResponse = toSignal<AutoparkUserResponse>(
    combineLatest([
      toObservable(this.tg_chat_id),
      toObservable(this.refreshTrigger)
    ]).pipe(
      debounceTime(50),
      distinctUntilChanged((prev, curr) => prev[0] === curr[0] && prev[1] === curr[1]),
      tap(() => this.isLoading.set(true)),
      // Извлекаем строго первый аргумент (chatId) для передачи в switchMap
      map(([chatId]) => chatId),
      // src/app/pages/autopark/garage/garage.ts (Обновленный apiResponse - Часть 1 из 2)

      switchMap((chatId) => {
        if (!chatId || Number.isNaN(Number(chatId))) {
          return of({ ok: false } as AutoparkUserResponse);
        }

        // Проверка кэша в глобальном синглтон-сторе
        const cachedData = this.store.cachedUserResponse();
        if (cachedData?.ok === true && cachedData.projects) {
          return of(cachedData); // Возврат из кэша
        }

        // Сетевой POST-запрос при отсутствии кэша
        return this.http.post<AutoparkUserResponse>(
          'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/check-user',
          { tg: { chat_id: Number(chatId) } },
          { withCredentials: true }
        ).pipe(
          tap((res) => {
            if (res?.ok === true) {
              this.store.cachedUserResponse.set(res);
            }
          }),
          catchError((err) => {
            console.error('🚨 [Garage Net Error]:', err);
            return of({ ok: false } as AutoparkUserResponse);
          })
        );
      }),
      tap(() => this.isLoading.set(false)),
      startWith({ ok: false, projects: {} } as AutoparkUserResponse)
    ),
    { requireSync: true }
  );

  /**
   * 4. Computed-трансформация объекта ответов в плоский массив для циклов шаблона.
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

  // Статические списки и состояния полей формы на базе Signal
  public readonly brands = signal<string[]>(['Volkswagen', 'Audi', 'BMW', 'Skoda', 'Toyota']);
  public readonly selectedBrand = signal<string>('');
  // Локальный буфер для хранения полной структуры ответа API моделей
  private readonly rawModelsResponse = signal<BrandModelsResponse | null>(null);
  /**
   * 🔥 НОВОЕ: Динамический фетчинг моделей на основе Сигнал-графа
   * При изменении selectedBrand() автоматически делает GET-запрос к API
   */
  public readonly availableModels = toSignal<string[]>(
    toObservable(this.selectedBrand).pipe(
      debounceTime(50),
      distinctUntilChanged(),
      switchMap((brand) => {
        // Если бренд еще не выбран, возвращаем пустой массив без сетевого запроса
        if (!brand) return of([]);

        const apiUrl = `https://pravosleva.pro/express-helper/car-service/get-models?vendor=${encodeURIComponent(brand)}`;

        console.log(`📡 [Garage API]: Запрос списка моделей для бренда: ${brand}...`);

        return this.http.get<BrandModelsResponse>(apiUrl).pipe(
          tap(res => {
            if (res && res.ok === true) {
              this.rawModelsResponse.set(res);
            }
          }),
          map(res => (res && res.ok === true && res.models) ? res.models : []),
          catchError((err) => {
            console.error(`🚨 [Garage API Error]: Ошибка загрузки моделей для ${brand}:`, err);
            return of([]);
          })
        );
      }),
      // Начальное состояние списка моделей до выбора бренда
      startWith([])
    ),
    { requireSync: true }
  );
  public readonly transmissions = signal<string[]>(['MT', 'AT', 'AMT', 'CVT']);


  public readonly selectedModel = signal<string>('');
  // 🔥 НОВОЕ: Сигнал для хранения ID выбранного поколения автомобиля
  public readonly selectedGenerationId = signal<number | null>(null);

  public readonly availableGenerations = computed<UIGenerationItem[]>(() => {
    const targetModelName = this.selectedModel();
    const rawData = this.rawModelsResponse();

    if (!targetModelName || !rawData || !rawData.byUremont || !rawData.byUremont.models) {
      return [];
    }

    const foundModel = rawData.byUremont.models.find(
      (m) => m.name.toLowerCase() === targetModelName.toLowerCase()
    );

    if (!foundModel || !foundModel.generations) return [];

    return foundModel.generations.map((gen) => {
      const finish = gen.finish_year === null ? 'н.в.' : gen.finish_year;

      // Хирургически извлекаем url миниатюры 140x140, если она существует в массиве images
      const hasThumb = gen.images && gen.images.length > 0 && gen.images[0].thumb_140_140;
      const imageUrl = hasThumb ? gen.images[0].thumb_140_140 : null;

      return {
        id: gen.id,
        name: gen.generation_name,
        yearsRange: `(${gen.start_year} - ${finish})`,
        imageUrl: imageUrl
      };
    });
  });
  public castToString(value: number): string {
    return String(value);
  }
  public readonly selectedTransmission = signal<string>('');
  public readonly selectedYear = signal<string>('');
  public readonly carCustomName = signal<string>('');

  public readonly isSubmitting = signal<boolean>(false);

  /**
   * Динамический диапазон годов, рассчитываемый строго под временные рамки выбранного поколения
   */
  public readonly availableYears = computed<string[]>(() => {
    const targetGenId = this.selectedGenerationId(); // Теперь это чистый number | null
    const targetModelName = this.selectedModel();
    const rawData = this.rawModelsResponse();

    if (!targetGenId || !targetModelName || !rawData?.byUremont?.models) {
      return [];
    }

    const foundModel = rawData.byUremont.models.find(
      (m) => m.name.toLowerCase() === targetModelName.toLowerCase()
    );
    if (!foundModel?.generations) return [];

    // Ищем поколение напрямую по числу без приведения типов
    const foundGen = foundModel.generations.find((g) => g.id === targetGenId);
    if (!foundGen) return [];

    const minYear = foundGen.start_year;
    const maxYear = foundGen.finish_year === null ? 2026 : foundGen.finish_year;

    if (!minYear || !maxYear || minYear > maxYear) return [];

    const yearsCount = maxYear - minYear + 1;
    return Array.from({ length: yearsCount }, (_, i) => String(maxYear - i));
  });

  // Расширенная валидация формы "на лету" (теперь учитывает и выбранное поколение)
  public readonly isFormValid = computed<boolean>(() =>
    Boolean(
      this.selectedBrand() &&
      this.selectedModel() &&
      this.selectedGenerationId() && // 🔥 ДОБАВЛЕНО В ВАЛИДАЦИЮ
      this.selectedTransmission() &&
      this.selectedYear() &&
      this.carCustomName().trim().length > 2
    )
  );

  // Сброс зависимых полей при смене бренда
  public onBrandChange(brand: string): void {
    this.selectedBrand.set(brand);
    this.selectedModel.set('');
    this.selectedGenerationId.set(null); // 🔥 УСТАНАВЛИВАЕМ null
    this.selectedTransmission.set('');
    this.selectedYear.set('');
  }

  public onModelChange(model: string): void {
    this.selectedModel.set(model);
    this.selectedGenerationId.set(null); // 🔥 УСТАНАВЛИВАЕМ null
    this.selectedYear.set('');
  }

  /**
   * 7. Отправка реального запроса на создание нового автомобиля
   */
  public createCarProcess(): void {
    if (!this.isFormValid() || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    const body = {
      chat_id: String(Number(this.tg_chat_id())),
      name: `${this.selectedBrand()} ${this.selectedModel()}, ${this.selectedTransmission()}, ${this.selectedYear()}`,
      description: this.carCustomName().trim()
    };

    this.http.post<{ ok: boolean }>(
      'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/create',
      body,
      { withCredentials: true }
    )
      .pipe(catchError(() => of({ ok: false })))
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);

          if (res && res.ok === true) {
            console.log('🟢 [Garage API Success]: Автомобиль зарегистрирован на бэкенде.');

            // 1. Очищаем локальные Сигналы формы
            this.carCustomName.set('');
            this.selectedBrand.set('');
            this.selectedModel.set('');
            this.selectedTransmission.set('');
            this.selectedYear.set('');

            // 2. ИНВАЛИДАЦИЯ КЭША И ОБНОВЛЕНИЕ ГРАФА:
            this.store.clearCache(); // Очищаем кэш синглтона
            this.refreshTrigger.update(v => v + 1); // Инкрементируем триггер для перезапуска switchMap
          } else {
            console.warn('⚠️ [Garage API Warning]: Бэкенд отклонил создание проекта.');
          }
        }
      });
  }
}
