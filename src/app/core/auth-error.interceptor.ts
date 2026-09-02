// core/auth-error.interceptor.ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const code = error?.error?.error?.code;

      if (code === 'INVALID_TOKEN' || code === 'UNAUTHENTICATED') {
        // Token is gone/expired — clear it and bounce back to
        // identity-admin-ui's login (there's no local /login route here).
        authService.clear({ sessionExpired: 'true' });
      }

      // Re-throw so component-level error handlers (notificationModal.open)
      // still run as normal.
      return throwError(() => error);
    }),
  );
};
