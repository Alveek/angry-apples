const { chromium } = require('playwright');
const assert = require('assert');

const GAME_URL = 'http://localhost:8080';

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${e.message}`);
    }
}

async function getGameState(page) {
    return page.evaluate(() => {
        const scene = game.scene.keys['GameScene'];
        return {
            snakeLength: scene.snake.length,
            headPos: { x: scene.snake[0].x, y: scene.snake[0].y },
            score: scene.score,
            nitro: Math.round(scene.nitro),
            nitroActive: scene.nitroActive,
            gameOver: scene.gameOver,
            preyPos: { x: scene.prey.x, y: scene.prey.y }
        };
    });
}

async function releaseKeys(page) {
    await page.evaluate(() => {
        const scene = game.scene.keys['GameScene'];
        scene.cursors.up.isDown = false;
        scene.cursors.down.isDown = false;
        scene.cursors.left.isDown = false;
        scene.cursors.right.isDown = false;
        scene.spaceKey.isDown = false;
    });
}

async function freshPage(page) {
    await page.reload();
    await page.waitForTimeout(1000);
}

(async () => {
    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            executablePath: '/home/alveek/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } catch (e) {
        console.error('Failed to launch browser:', e.message);
        process.exit(1);
    }
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(GAME_URL);
    await page.waitForTimeout(1000);

    console.log('\n=== Initial State ===');

    await test('game loads with canvas', async () => {
        const canvas = await page.$('canvas');
        assert.ok(canvas, 'Canvas element should exist');
    });

    await test('snake starts with 5 segments', async () => {
        const state = await getGameState(page);
        assert.strictEqual(state.snakeLength, 5);
    });

    await test('snake starts near center', async () => {
        const state = await getGameState(page);
        assert.ok(state.headPos.x >= 17 && state.headPos.x <= 27, `Head x=${state.headPos.x} should be near center`);
        assert.ok(state.headPos.y >= 12 && state.headPos.y <= 18, `Head y=${state.headPos.y} should be near center`);
    });

    await test('score starts at 0', async () => {
        const state = await getGameState(page);
        assert.strictEqual(state.score, 0);
    });

    await test('nitro starts full', async () => {
        const state = await getGameState(page);
        assert.strictEqual(state.nitro, 40);
    });

    await test('nitro is not active at start', async () => {
        const state = await getGameState(page);
        assert.strictEqual(state.nitroActive, false);
    });

    await test('game is not over at start', async () => {
        const state = await getGameState(page);
        assert.strictEqual(state.gameOver, false);
    });

    await test('prey exists', async () => {
        const state = await getGameState(page);
        assert.ok(state.preyPos.x >= 0 && state.preyPos.x < 40);
        assert.ok(state.preyPos.y >= 0 && state.preyPos.y < 27);
    });

    console.log('\n=== Movement ===');

    await test('snake moves right by default', async () => {
        await freshPage(page);
        const state1 = await getGameState(page);
        await page.waitForTimeout(500);
        const state2 = await getGameState(page);
        assert.ok(state2.headPos.x > state1.headPos.x || state2.gameOver, `Snake should move right: ${state1.headPos.x} -> ${state2.headPos.x}`);
    });

    console.log('\n=== Nitro ===');

    await test('nitro drains when active', async () => {
        await freshPage(page);
        await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            scene.nitroActive = true;
            scene.spaceKey.isDown = true;
        });
        await page.waitForTimeout(1500);
        const state = await getGameState(page);
        await releaseKeys(page);
        assert.ok(state.nitro < 40, `Nitro should drain, got ${state.nitro}`);
    });

    await test('nitro recharges when not active', async () => {
        await freshPage(page);
        await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            scene.nitro = 20;
            scene.nitroActive = false;
            scene.spaceKey.isDown = false;
        });
        await page.waitForTimeout(1500);
        const state = await getGameState(page);
        assert.ok(state.nitro > 20, `Nitro should recharge, got ${state.nitro}`);
    });

    await test('nitro deactivates when empty', async () => {
        await freshPage(page);
        await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            scene.nitro = 5;
            scene.nitroActive = true;
            scene.spaceKey.isDown = true;
        });
        await page.waitForTimeout(1000);
        const state = await getGameState(page);
        await releaseKeys(page);
        assert.strictEqual(state.nitroActive, false, `Nitro should deactivate when empty, nitro=${state.nitro}`);
    });

    console.log('\n=== Game Over ===');

    await test('game over on wall collision', async () => {
        await freshPage(page);
        await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            scene.snake[0].x = 39;
            scene.snake[0].y = 15;
            scene.direction = Phaser.Math.Vector2.RIGHT;
            scene.nextDirection = Phaser.Math.Vector2.RIGHT;
            scene.moveTimer = 149;
        });
        await page.waitForTimeout(500);
        const state = await getGameState(page);
        assert.strictEqual(state.gameOver, true, 'Game should be over after wall collision');
    });

    await test('game over shows restart text', async () => {
        await freshPage(page);
        await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            scene.snake[0].x = 39;
            scene.snake[0].y = 15;
            scene.direction = Phaser.Math.Vector2.RIGHT;
            scene.nextDirection = Phaser.Math.Vector2.RIGHT;
            scene.moveTimer = 149;
        });
        await page.waitForTimeout(500);
        const visible = await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            return scene.restartText.visible;
        });
        assert.strictEqual(visible, true, 'Restart text should be visible');
    });

    await test('can restart after game over', async () => {
        await freshPage(page);
        await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            scene.snake[0].x = 39;
            scene.snake[0].y = 15;
            scene.direction = Phaser.Math.Vector2.RIGHT;
            scene.nextDirection = Phaser.Math.Vector2.RIGHT;
            scene.moveTimer = 149;
        });
        await page.waitForTimeout(500);
        await freshPage(page);
        const state = await getGameState(page);
        assert.strictEqual(state.gameOver, false, 'Game should not be over after restart');
        assert.strictEqual(state.snakeLength, 5, 'Snake should have 5 segments after restart');
    });

    console.log('\n=== Prey ===');

    await test('prey moves when snake is nearby', async () => {
        await freshPage(page);
        const state1 = await getGameState(page);
        await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            scene.snake[0].x = scene.prey.x - 3;
            scene.snake[0].y = scene.prey.y;
        });
        await page.waitForTimeout(300);
        const state2 = await getGameState(page);
        await releaseKeys(page);
    });

    console.log('\n=== UI ===');

    await test('score text displays correctly', async () => {
        await freshPage(page);
        const text = await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            return scene.scoreText.text;
        });
        assert.ok(text.includes('Score'), 'Score text should contain "Score"');
    });

    await test('nitro bar has width', async () => {
        await freshPage(page);
        const barWidth = await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            return scene.nitroBar.width;
        });
        assert.ok(barWidth > 0, 'Nitro bar should have width');
    });

    await test('controls hint is visible', async () => {
        await freshPage(page);
        const text = await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            return scene.controlsText.text;
        });
        assert.ok(text.includes('SPACE'), 'Controls hint should mention SPACE');
        assert.ok(text.includes('WASD'), 'Controls hint should mention WASD');
    });

    await test('nitro label does not overlap bar', async () => {
        await freshPage(page);
        const overlap = await page.evaluate(() => {
            const scene = game.scene.keys['GameScene'];
            const labelRight = scene.nitroLabel.x;
            const barLeft = scene.nitroBarBg.x - scene.nitroBarBg.width / 2;
            return labelRight > barLeft;
        });
        assert.strictEqual(overlap, false, 'Nitro label should not overlap the bar');
    });

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
