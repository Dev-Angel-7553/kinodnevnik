// Фон приложения: три размытых приглушённых пятна (CSS-переменные --amb-1…3 на <html>).
// Страница фильма и мини-окно фильма подставляют цвета его постера, CSS плавно их меняет.
// Источники цвета складываются в стек: закрыли мини-окно — вернулись цвета страницы под ним.

const KEYS = ['--amb-1', '--amb-2', '--amb-3'];
const stack = [];
let nextId = 0;

function apply() {
  const style = document.documentElement.style;
  const top = stack[stack.length - 1];
  KEYS.forEach((key, i) => (top?.colors?.[i] ? style.setProperty(key, top.colors[i]) : style.removeProperty(key)));
}

// Ставит цвета фона и возвращает функцию, которая их убирает
export function setAmbient(colors) {
  const id = ++nextId;
  stack.push({ id, colors });
  apply();
  return () => {
    const index = stack.findIndex(entry => entry.id === id);
    if (index >= 0) stack.splice(index, 1);
    apply();
  };
}
