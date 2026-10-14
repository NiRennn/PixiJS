import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';

/**
 * Создает сочный эффект разлетающихся искр/звездочек при слиянии двух предметов
 */
export function playMergeSparks(container: Container, x: number, y: number) {
  const sparkCount = 10;
  const colors = [0xfcd34d, 0x60a5fa, 0xec4899, 0xa855f7, 0xffffff];

  for (let i = 0; i < sparkCount; i++) {
    const spark = new Graphics();
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 3 + Math.random() * 4;

    spark.circle(0, 0, size).fill({ color });
    spark.position.set(x, y);
    container.addChild(spark);

    const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
    const distance = 35 + Math.random() * 40;
    const destX = x + Math.cos(angle) * distance;
    const destY = y + Math.sin(angle) * distance;

    gsap.to(spark.position, {
      x: destX,
      y: destY,
      duration: 0.45 + Math.random() * 0.2,
      ease: 'power2.out',
    });

    gsap.to(spark.scale, {
      x: 0,
      y: 0,
      duration: 0.45 + Math.random() * 0.2,
      ease: 'power2.in',
      onComplete: () => {
        container.removeChild(spark);
        spark.destroy();
      },
    });
  }
}

/**
 * Анимация полета золотых монет от выполненного заказа к счетчику наверху
 */
export function playFlyingCoins(
  container: Container,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  onFinish?: () => void
) {
  const coinCount = 7;
  let finished = 0;

  for (let i = 0; i < coinCount; i++) {
    const coin = new Graphics();
    // Золотая монетка с блеском
    coin.circle(0, 0, 9).fill({ color: 0xfbbf24 }).stroke({ width: 1.5, color: 0xfef08a });
    coin.circle(0, 0, 5).stroke({ width: 1, color: 0xd97706 });

    // Стартовая позиция со случайным разбросом
    const startX = fromX + (Math.random() - 0.5) * 20;
    const startY = fromY + (Math.random() - 0.5) * 20;
    coin.position.set(startX, startY);
    container.addChild(coin);

    // Задержка старта для каждой монетки, чтобы они летели ручейком
    const delay = i * 0.05;

    // Дуга полета: сначала легкий подскок вверх/вбок, потом притягивание к счетчику
    const midX = (startX + toX) / 2 + (Math.random() - 0.5) * 50;
    const midY = Math.min(startY, toY) - 30 - Math.random() * 20;

    const tl = gsap.timeline({
      delay,
      onComplete: () => {
        container.removeChild(coin);
        coin.destroy();
        finished++;
        if (finished === coinCount && onFinish) {
          onFinish();
        }
      },
    });

    // Полет по кривой через две фазы
    tl.to(coin.position, {
      x: midX,
      y: midY,
      duration: 0.25,
      ease: 'power1.out',
    });

    tl.to(coin.position, {
      x: toX,
      y: toY,
      duration: 0.35,
      ease: 'power2.in',
    });

    tl.to(
      coin.scale,
      {
        x: 0.7,
        y: 0.7,
        duration: 0.35,
      },
      '<0.1'
    );
  }
}
