import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { authErrorInterceptor } from './core/auth-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authErrorInterceptor])),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ]
};
