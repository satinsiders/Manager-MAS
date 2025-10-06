export function autoSizeTextarea(textarea, minHeight = 64, maxHeight = 240) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const next = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
  textarea.style.height = next + 'px';
}

export function scrollToBottom(element) {
  if (!element) return;
  window.requestAnimationFrame(() => {
    element.scrollTop = element.scrollHeight;
  });
}

export function setMetricValue(element, value) {
  if (!element) return;
  element.textContent = value;
}

export function renderPlaceholder(listElement, message) {
  if (!listElement) return;
  const placeholder = document.createElement('li');
  placeholder.className = 'hub-placeholder';
  placeholder.textContent = message;
  listElement.appendChild(placeholder);
}

export function formatRelativeTimestamp(isoText) {
  if (!isoText) return 'Updated just now';
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return 'Updated just now';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: sameDay ? undefined : 'short',
    day: sameDay ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const label = formatter.format(date);
  return sameDay ? `Updated today • ${label}` : `Updated ${label}`;
}

export function formatDateLabel(isoText) {
  if (!isoText) return 'Unknown date';
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatOperationName(operation) {
  return operation
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1).replace(/\.0$/, '') + 's';
}
