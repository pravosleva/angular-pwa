import { Component, signal, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
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
  // 1. Внедряем системные зависимости и наш глобальный стор-синглтон
  private readonly http = inject(HttpClient);
  private readonly store = inject(AutoparkStoreService);

  /**
   * 2. Входящий сигнальный инпут от роутера.
   * Благодаря сработавшему флагу withComponentInputBinding(),
   * Angular рантаймом автоматически заполнит его значением из пути /autopark/:tg_chat_id
   */
  public readonly tg_chat_id = input.required<string>();

  // 3. Локальный сигнал для отображения состояния фетчинга данных
  public readonly isLoading = signal<boolean>(false);

  /**
   * 3. Умный реактивный мост с поддержкой глобального кэша
   * Трансформирует изменения инпута tg_chat_id в поток данных
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

        // Проверяем наличие валидных данных в глобальном синглтон-сторе
        const cachedData = this.store.cachedUserResponse();
        if (cachedData && cachedData.ok === true && cachedData.projects) {
          console.log('🟢 [Garage UI]: Данные успешно извлечены из глобального кэша authGuard.');
          return of(cachedData); // Мгновенный синхронный возврат без curl-запроса в сеть
        }

        console.log('📡 [Garage UI]: Кэш пуст или невалиден. Выполняю сетевой POST-запрос check-user...');
        const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/check-user';
        const body = { tg: { chat_id: Number(chatId) } };
        return this.http.post<AutoparkUserResponse>(
          apiUrl,
          body,
          { withCredentials: true }
        ).pipe(
          tap((res) => {
            if (res && res.ok === true) {
              console.log('💾 [Garage UI]: Сетевой ответ успешно сохранен в глобальный кэш стора.');
              this.store.cachedUserResponse.set(res); // Заполняем кэш для всей панели
            }
          }),
          catchError((err) => {
            console.error('🚨 [Garage Net Error]: Не удалось загрузить автомобили из сети:', err);
            return of({ ok: false } as AutoparkUserResponse);
          })
        );
      }),
      tap(() => this.isLoading.set(false)),
      // Гарантируем начальное состояние для computed-графа
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
  public readonly selectedTransmission = signal<string>('');
  public readonly selectedYear = signal<string>('');
  public readonly carCustomName = signal<string>('');

  public readonly isSubmitting = signal<boolean>(false);

  // Динамический диапазон годов (2000–2026) при выбранной модели
  public readonly availableYears = computed<string[]>(() => {
    if (!this.selectedModel()) return [];
    return Array.from({ length: 27 }, (_, i) => String(2026 - i));
  });

  // Валидация формы "на лету" (бренд, модель, КПП, год и длина имени > 2)
  public readonly isFormValid = computed<boolean>(() =>
    Boolean(this.selectedBrand() && this.selectedModel() && this.selectedTransmission() && this.selectedYear() && this.carCustomName().trim().length > 2)
  );

  // Сброс зависимых полей при смене бренда
  public onBrandChange(brand: string): void {
    this.selectedBrand.set(brand);
    this.selectedModel.set('');
    this.selectedTransmission.set('');
    this.selectedYear.set('');
  }

  /**
   * 7. Отправка реального запроса на создание нового автомобиля
   */
  public createCarProcess(): void {
    if (!this.isFormValid() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    console.log('📡 [Garage UI Form]: Инициализирована сборка структуры автомобиля...');

    // Компонуем имя машины по правилам платформы Autopark
    const formattedProjectName = `${this.selectedBrand()} ${this.selectedModel()}, ${this.selectedTransmission()}, ${this.selectedYear()}`;
    const currentChatId = Number(this.tg_chat_id());

    const apiUrl = 'https://pravosleva.pro/express-helper/pravosleva-bot-2021/autopark-2022/project/create';

    const body = {
      chat_id: String(currentChatId),
      name: formattedProjectName,
      description: this.carCustomName().trim()
    };
    this.http.post<{ ok: boolean; message?: string }>(
      apiUrl,
      body,
      { withCredentials: true }
    ).pipe(
      catchError((err) => {
        console.error('🚨 [Garage API Error]: Не удалось добавить автомобиль:', err);
        return of({ ok: false });
      })
    ).subscribe({
      next: (res) => {
        console.log(res)
        this.isSubmitting.set(false);

        if (res && res.ok === true) {
          console.log('🟢 [Garage API Success]: Автомобиль успешно зарегистрирован на бэкенде.');

          // 1. Очищаем локальные Сигналы формы
          this.carCustomName.set('');
          this.selectedBrand.set('');
          this.selectedModel.set('');
          this.selectedTransmission.set('');
          this.selectedYear.set('');

          // 2. ИНВАЛИДАЦИЯ КЭША СТОРА:
          // Сброс кэша автоматически сработает наapiResponse() (из Части 3),
          // потому что при следующем цикле Change Detection кэш окажется null,
          // и поток выполнит чистый сетевой перезапрос check-user для обновления UI!
          this.store.clearCache();
        } else {
          console.warn('⚠️ [Garage API Warning]: Бэкенд отклонил создание проекта.');
        }
      }
    });
  }

}
