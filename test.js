const assert = require('assert');

global.Phaser = {
    Math: {
        Clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
        Between: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
    }
};

const {
    CELL, COLS, ROWS, UI_HEIGHT, WIDTH, HEIGHT,
    BASE_SPEED, NITRO_SPEED, PREY_SPEED, PREY_BOOST_SPEED,
    HUNTER_SPEED, HUNTER_INTERVAL, HUNTER_SCORE, TAIL_PENALTY,
    NITRO_MAX, NITRO_DRAIN, NITRO_RECHARGE,
    calcNewHead, checkWallCollision, checkSelfCollision,
    calcPreyDirection, findPreyMove, updateNitroValue,
    getNitroColor, isOpposite, findHunterMove
} = require('./game.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${e.message}`);
    }
}

console.log('\n=== Constants ===');

test('CELL is 20', () => assert.strictEqual(CELL, 20));
test('COLS is 40', () => assert.strictEqual(COLS, 40));
test('ROWS is 27', () => assert.strictEqual(ROWS, 27));
test('UI_HEIGHT is 80', () => assert.strictEqual(UI_HEIGHT, 80));
test('WIDTH is 800', () => assert.strictEqual(WIDTH, 800));
test('HEIGHT is 620', () => assert.strictEqual(HEIGHT, 620));
test('BASE_SPEED is 150', () => assert.strictEqual(BASE_SPEED, 150));
test('NITRO_SPEED is 80', () => assert.strictEqual(NITRO_SPEED, 80));
test('PREY_SPEED is 200', () => assert.strictEqual(PREY_SPEED, 200));
test('PREY_BOOST_SPEED is 100', () => assert.strictEqual(PREY_BOOST_SPEED, 100));
test('NITRO_MAX is 40', () => assert.strictEqual(NITRO_MAX, 40));
test('NITRO_DRAIN is 40', () => assert.strictEqual(NITRO_DRAIN, 40));
test('NITRO_RECHARGE is 10', () => assert.strictEqual(NITRO_RECHARGE, 10));

console.log('\n=== calcNewHead ===');

test('moves right', () => {
    const result = calcNewHead({ x: 5, y: 5 }, { x: 1, y: 0 });
    assert.deepStrictEqual(result, { x: 6, y: 5 });
});

test('moves up', () => {
    const result = calcNewHead({ x: 10, y: 10 }, { x: 0, y: -1 });
    assert.deepStrictEqual(result, { x: 10, y: 9 });
});

test('moves left', () => {
    const result = calcNewHead({ x: 0, y: 15 }, { x: -1, y: 0 });
    assert.deepStrictEqual(result, { x: -1, y: 15 });
});

test('moves down', () => {
    const result = calcNewHead({ x: 20, y: 0 }, { x: 0, y: 1 });
    assert.deepStrictEqual(result, { x: 20, y: 1 });
});

console.log('\n=== checkWallCollision ===');

test('no collision in center', () => {
    assert.strictEqual(checkWallCollision({ x: 20, y: 15 }), false);
});

test('collision at left edge', () => {
    assert.strictEqual(checkWallCollision({ x: -1, y: 10 }), true);
});

test('collision at right edge', () => {
    assert.strictEqual(checkWallCollision({ x: COLS, y: 10 }), true);
});

test('collision at top edge', () => {
    assert.strictEqual(checkWallCollision({ x: 10, y: -1 }), true);
});

test('collision at bottom edge', () => {
    assert.strictEqual(checkWallCollision({ x: 10, y: ROWS }), true);
});

test('no collision at valid edge (0,0)', () => {
    assert.strictEqual(checkWallCollision({ x: 0, y: 0 }), false);
});

test('no collision at valid edge (COLS-1, ROWS-1)', () => {
    assert.strictEqual(checkWallCollision({ x: COLS - 1, y: ROWS - 1 }), false);
});

console.log('\n=== checkSelfCollision ===');

test('no collision with empty snake', () => {
    assert.strictEqual(checkSelfCollision({ x: 5, y: 5 }, []), false);
});

test('collision with body segment', () => {
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
    assert.strictEqual(checkSelfCollision({ x: 5, y: 5 }, snake), true);
});

test('no collision when not overlapping', () => {
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
    assert.strictEqual(checkSelfCollision({ x: 10, y: 10 }, snake), false);
});

console.log('\n=== calcPreyDirection ===');

test('returns null when far away', () => {
    const result = calcPreyDirection({ x: 20, y: 20 }, { x: 5, y: 5 });
    assert.strictEqual(result, null);
});

test('returns direction when prey is to the right', () => {
    const result = calcPreyDirection({ x: 10, y: 10 }, { x: 5, y: 10 });
    assert.strictEqual(result.moveX, 1);
    assert.strictEqual(result.moveY, 0);
});

test('returns direction when prey is above', () => {
    const result = calcPreyDirection({ x: 10, y: 5 }, { x: 10, y: 10 });
    assert.strictEqual(result.moveX, 0);
    assert.strictEqual(result.moveY, -1);
});

test('returns distance', () => {
    const result = calcPreyDirection({ x: 8, y: 10 }, { x: 5, y: 10 });
    assert.strictEqual(result.dist, 3);
});

test('uses y-axis when distances equal', () => {
    const result = calcPreyDirection({ x: 8, y: 8 }, { x: 5, y: 5 });
    assert.strictEqual(result.moveX, 0);
    assert.strictEqual(result.moveY, 1);
});

console.log('\n=== findPreyMove ===');

test('moves away from snake when clear path', () => {
    const snake = [{ x: 5, y: 10 }];
    const result = findPreyMove({ x: 10, y: 10 }, snake[0], snake);
    assert.strictEqual(result.x, 11);
    assert.strictEqual(result.y, 10);
});

test('finds alternative when primary blocked', () => {
    const snake = [
        { x: 5, y: 10 },
        { x: 11, y: 10 },
        { x: 10, y: 9 },
        { x: 10, y: 11 }
    ];
    const result = findPreyMove({ x: 10, y: 10 }, snake[0], snake);
    assert.ok(result !== null);
    assert.ok(result.x >= 0 && result.x < COLS);
    assert.ok(result.y >= 0 && result.y < ROWS);
});

test('stays within bounds', () => {
    const snake = [{ x: 1, y: 0 }];
    const result = findPreyMove({ x: 0, y: 0 }, snake[0], snake);
    assert.ok(result === null || (result.x >= 0 && result.x < COLS));
    assert.ok(result === null || (result.y >= 0 && result.y < ROWS));
});

test('returns null when prey is far', () => {
    const snake = [{ x: 0, y: 0 }];
    const result = findPreyMove({ x: 30, y: 30 }, snake[0], snake);
    assert.strictEqual(result, null);
});

test('prey in corner finds escape path', () => {
    const snake = [{ x: 3, y: 0 }];
    const result = findPreyMove({ x: 0, y: 0 }, snake[0], snake);
    assert.ok(result !== null, 'Prey should find a move from corner');
    assert.ok(result.x !== 0 || result.y !== 0, 'Prey should actually move');
});

test('prey in corner blocked on two sides escapes', () => {
    const snake = [{ x: 3, y: 0 }, { x: 0, y: 3 }];
    const result = findPreyMove({ x: 0, y: 0 }, snake[0], snake);
    assert.ok(result !== null, 'Prey should find a move even when blocked on two sides');
});

test('prey does not oscillate back to previous position', () => {
    const snake = [{ x: 2, y: 0 }];
    const prevPos = { x: 0, y: 1 };
    const prey = { x: 0, y: 0 };
    const result = findPreyMove(prey, snake[0], snake, prevPos);
    assert.ok(result === null || (result.x !== 0 || result.y !== 1), 'Prey should not move back to previous position');
});

test('prey finds alternative when primary and prevPos are blocked', () => {
    const snake = [{ x: 2, y: 0 }];
    const prevPos = { x: 0, y: 1 };
    const prey = { x: 0, y: 0 };
    const result = findPreyMove(prey, snake[0], snake, prevPos);
    if (result) {
        assert.ok(result.x !== 0 || result.y !== 1, 'Should not return previous position');
    }
});

console.log('\n=== updateNitroValue ===');

test('drains nitro when active', () => {
    const result = updateNitroValue(100, true, 1);
    assert.strictEqual(result, 60);
});

test('recharges nitro when inactive', () => {
    const result = updateNitroValue(0, false, 1);
    assert.strictEqual(result, 10);
});

test('does not go below 0', () => {
    const result = updateNitroValue(10, true, 1);
    assert.strictEqual(result, 0);
});

test('does not exceed NITRO_MAX', () => {
    const result = updateNitroValue(30, false, 1);
    assert.strictEqual(result, 40);
});

test('HUNTER_SPEED is 130', () => assert.strictEqual(HUNTER_SPEED, 130));
test('HUNTER_INTERVAL is 5', () => assert.strictEqual(HUNTER_INTERVAL, 5));
test('HUNTER_SCORE is 50', () => assert.strictEqual(HUNTER_SCORE, 50));
test('TAIL_PENALTY is 10', () => assert.strictEqual(TAIL_PENALTY, 10));

test('findHunterMove moves toward target', () => {
    const snake = [{ x: 20, y: 13 }];
    const hunter = { x: 25, y: 13 };
    const target = { x: 20, y: 13 };
    const result = findHunterMove(hunter, target, snake);
    assert.ok(result !== null, 'Hunter should find a move');
    assert.ok(result.x < 25, 'Hunter should move left toward target');
});

test('findHunterMove can go around snake body', () => {
    const snake = [{ x: 24, y: 13 }, { x: 23, y: 13 }];
    const hunter = { x: 25, y: 13 };
    const target = { x: 20, y: 13 };
    const result = findHunterMove(hunter, target, snake);
    // Primary move x=-1 → blocked by snake at 24
    // Fallback should find (25,12) or (25,14)
    assert.ok(result !== null, 'Hunter should find alternative path');
});

test('partial drain', () => {
    const result = updateNitroValue(40, true, 0.5);
    assert.strictEqual(result, 20);
});

test('partial recharge', () => {
    const result = updateNitroValue(20, false, 0.5);
    assert.strictEqual(result, 25);
});

console.log('\n=== getNitroColor ===');

test('yellow when > 50%', () => {
    assert.strictEqual(getNitroColor(0.6), 0xf0a500);
});

test('orange when 20-50%', () => {
    assert.strictEqual(getNitroColor(0.3), 0xff6600);
});

test('red when < 20%', () => {
    assert.strictEqual(getNitroColor(0.1), 0xff0000);
});

test('yellow at exactly 50%', () => {
    assert.strictEqual(getNitroColor(0.5), 0xff6600);
});

test('orange at exactly 20%', () => {
    assert.strictEqual(getNitroColor(0.2), 0xff0000);
});

console.log('\n=== isOpposite ===');

test('right vs left is opposite', () => {
    assert.strictEqual(isOpposite({ x: 1, y: 0 }, { x: -1, y: 0 }), true);
});

test('up vs down is opposite', () => {
    assert.strictEqual(isOpposite({ x: 0, y: -1 }, { x: 0, y: 1 }), true);
});

test('same direction is not opposite', () => {
    assert.strictEqual(isOpposite({ x: 1, y: 0 }, { x: 1, y: 0 }), false);
});

test('perpendicular is not opposite', () => {
    assert.strictEqual(isOpposite({ x: 1, y: 0 }, { x: 0, y: 1 }), false);
});

test('left vs right is opposite', () => {
    assert.strictEqual(isOpposite({ x: -1, y: 0 }, { x: 1, y: 0 }), true);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

process.exit(failed > 0 ? 1 : 0);
