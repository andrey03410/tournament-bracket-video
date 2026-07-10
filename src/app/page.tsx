import { redirect } from "next/navigation";
import { auth } from "@/auth";

const FEATURES = [
  {
    icon: "⚔️",
    title: "Попарные сравнения",
    text: "Загрузите ZIP с треками — сайт построит турнирную сетку: сравнительная сортировка, швейцарка или круговая.",
  },
  {
    icon: "🎬",
    title: "Аудио и видео",
    text: "Треки могут быть mp3/flac и mp4/webm/mov вперемешку — опенинги сравниваются с OST наравне.",
  },
  {
    icon: "🙈",
    title: "Слепой режим",
    text: "Названия и видеоряд скрыты до вашего вердикта — выбирает ухо, а не привязанность.",
  },
  {
    icon: "🏆",
    title: "Итоговый топ",
    text: "Готовый рейтинг с ручной доводкой: перетащите позиции, если сердце не согласно с математикой.",
  },
  {
    icon: "🖼",
    title: "Конструктор видео",
    text: "На каждую позицию — картинка или видеоряд с обрезкой 16:9, свой фрагмент трека и живое превью.",
  },
  {
    icon: "📼",
    title: "Рендер в MP4",
    text: "Шаблонное видео-«топ» 1080p — интро, плашки, счётчик позиций — готово к публикации.",
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/tournaments");

  return (
    <div className="container">
      <section className="welcome-hero panel">
        <h1>Соберите честный топ саундтреков</h1>
        <p className="muted" style={{ fontSize: 17, maxWidth: 640 }}>
          OST Top Builder превращает папку треков в турнир попарных сравнений,
          а его итог — в готовое видео-«топ». Никаких таблиц и мучительных
          «а что поставить выше»: только вы и две кнопки.
        </p>
        <div className="row" style={{ gap: 12, marginTop: 18 }}>
          <a className="btn" href="/login">
            Войти
          </a>
          <a className="btn ghost" href="/login?mode=register">
            Зарегистрироваться
          </a>
        </div>
      </section>

      <section className="feature-grid">
        {FEATURES.map((f) => (
          <div className="panel feature-card" key={f.title}>
            <div style={{ fontSize: 28 }}>{f.icon}</div>
            <h3>{f.title}</h3>
            <p className="muted">{f.text}</p>
          </div>
        ))}
      </section>

      <p className="muted" style={{ textAlign: "center", margin: "24px 0" }}>
        Контент виден только после входа. Зарегистрируйтесь — это бесплатно —
        и соберите свой первый топ за вечер.
      </p>
    </div>
  );
}
