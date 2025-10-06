import { storeLoginAlert } from '../theme.js';

export const LOGIN_REDIRECT_MESSAGE = 'Session ended. Please sign in again.';

export function redirectToLogin(message = LOGIN_REDIRECT_MESSAGE) {
  storeLoginAlert(message);
  window.location.replace('/');
}

export function handleUnauthenticated(message = LOGIN_REDIRECT_MESSAGE) {
  redirectToLogin(message);
}
