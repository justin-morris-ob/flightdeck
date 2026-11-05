import { expect, test as base, type Locator, type Page } from '@playwright/test';

function installPresentation(): void {
  if (window.top !== window) return;

  const mount = () => {
    if (document.getElementById('flightdeck-demo-presentation')) return;
    const host = document.createElement('div');
    host.id = 'flightdeck-demo-presentation';
    host.setAttribute('aria-hidden', 'true');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
        font-family: system-ui, sans-serif;
        color: #fff;
      }
      *, *::before, *::after { box-sizing: border-box; pointer-events: none; }
      [hidden] { display: none !important; }
      #caption {
        position: absolute;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        width: max-content;
        max-width: calc(100% - 80px);
        padding: 18px 28px;
        border: 1px solid #59677b;
        border-radius: 14px;
        background: #101b2ff2;
        box-shadow: 0 8px 32px #0005;
        font-size: 23px;
        line-height: 1.45;
        text-align: center;
        white-space: pre-wrap;
      }
      #chapter {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        padding: 80px;
        background: #101b2ff2;
        text-align: center;
      }
      #title { margin: 0 0 24px; font-size: 48px; line-height: 1.2; }
      #body { max-width: 1000px; margin: 0; font-size: 27px; line-height: 1.6; white-space: pre-wrap; }
      #pointer {
        position: absolute;
        top: 0;
        left: 0;
        transform: translate(40px, 40px);
        width: 26px;
        height: 34px;
        filter: drop-shadow(0 2px 3px #000a);
      }
      #pointer::before {
        content: '';
        position: absolute;
        inset: 0;
        background: #fff;
        clip-path: polygon(0 0, 0 90%, 26% 68%, 44% 100%, 63% 90%, 44% 59%, 80% 59%);
      }
      #pulse {
        position: absolute;
        top: -18px;
        left: -18px;
        width: 40px;
        height: 40px;
        border: 3px solid #61d7ff;
        border-radius: 50%;
        opacity: 0;
      }
    `;
    const caption = document.createElement('div');
    caption.id = 'caption';
    caption.hidden = true;
    const chapter = document.createElement('div');
    chapter.id = 'chapter';
    chapter.hidden = true;
    const title = document.createElement('h1');
    title.id = 'title';
    const body = document.createElement('p');
    body.id = 'body';
    chapter.append(title, body);
    const pointer = document.createElement('div');
    pointer.id = 'pointer';
    const pulse = document.createElement('div');
    pulse.id = 'pulse';
    pointer.append(pulse);
    root.append(style, caption, chapter, pointer);
    document.documentElement.append(host);
    document.addEventListener(
      'mousemove',
      (event) => {
        pointer.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      },
      true
    );
    document.addEventListener(
      'mousedown',
      () => {
        pulse.animate(
          [
            { opacity: 1, transform: 'scale(0.6)' },
            { opacity: 0, transform: 'scale(1.5)' },
          ],
          { duration: 500 }
        );
      },
      true
    );
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}

export class Demo {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async caption(text: string): Promise<void> {
    await this.page.evaluate((value) => {
      const element = document
        .getElementById('flightdeck-demo-presentation')
        ?.shadowRoot?.getElementById('caption');
      if (!element) throw new Error('Demo caption overlay is not installed.');
      element.textContent = value;
      element.hidden = value.length === 0;
    }, text);
  }

  async clearCaption(): Promise<void> {
    await this.caption('');
  }

  async chapter(title: string, body: string, ms = 3000): Promise<void> {
    await this.clearCaption();
    await this.page.evaluate(
      (content) => {
        const root = document.getElementById('flightdeck-demo-presentation')?.shadowRoot;
        const card = root?.getElementById('chapter');
        const heading = root?.getElementById('title');
        const description = root?.getElementById('body');
        if (!card || !heading || !description) {
          throw new Error('Demo chapter overlay is not installed.');
        }
        heading.textContent = content.title;
        description.textContent = content.body;
        card.hidden = false;
      },
      { title, body }
    );
    await this.pause(ms);
    await this.page.evaluate(() => {
      const card = document
        .getElementById('flightdeck-demo-presentation')
        ?.shadowRoot?.getElementById('chapter');
      if (card) card.hidden = true;
    });
  }

  async pause(ms = 2500): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async point(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible();
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box || box.width === 0 || box.height === 0) {
      throw new Error('Cannot point at a demo control without a visible bounding box.');
    }
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
    await this.pause(400);
  }

  async click(locator: Locator): Promise<void> {
    await this.point(locator);
    await locator.click();
    await this.pause(650);
  }

  async fill(locator: Locator, text: string): Promise<void> {
    await this.click(locator);
    await locator.fill('');
    await locator.pressSequentially(text, { delay: 65 });
    await this.pause(650);
  }

  async select(locator: Locator, value: string): Promise<void> {
    await this.point(locator);
    await locator.selectOption(value);
    await this.pause(650);
  }
}

export const test = base.extend<{ demo: Demo }>({
  demo: async ({ page }, use) => {
    await page.addInitScript(installPresentation);
    await page.evaluate(installPresentation);
    await use(new Demo(page));
  },
});

export { expect };
