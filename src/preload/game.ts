import { Context } from '../context';
import Preload from './preload';
import { readFileSync } from 'fs';
import '../types/window';
import { join } from 'path';
import { branch, commit } from '../../buildinfo.json';
import { ipcRenderer } from 'electron/renderer';
import { waitFor } from '../util';

export default class GamePreload extends Preload {
    context = Context.Game;

    onLoadStart() {
        window.OffCliV = true;
        localStorage.removeItem('conUID_'); // anti tracking
    }

    onLoadEnd() {
        loadMouseDriver();

        window.clientExit.style.display = 'flex';
        window.closeClient = () => window.close();

        let style = document.createElement('style');
        style.textContent = readFileSync(
            join(__dirname, '../../assets/style/game.css'),
            'utf8'
        );
        document.head.append(style);

        injectWatermark();
        injectHSP();
    }
}

function injectWatermark() {
    let watermark = document.createElement('div');
    watermark.dataset.text = '[Rays] Nova';
    watermark.dataset.version = `${branch}/${commit}`;
    watermark.id = 'clientWatermark';

    document
        .getElementById('matchInfo')
        .insertAdjacentElement('beforebegin', watermark);

    document.getElementById('timerHolder').style.cssText +=
        ';width:fit-content!important';
}

function loadMouseDriver() {
    try {
        if (!(window as any).getEventListeners) throw new Error('getEventListeners not found');
        console.log('Mouse handler loaded.');

        let lastData: any;

        let move: any;
        let down: any;
        let up: any;

        ipcRenderer.on('mouse-data', (_, mouseData) => {
            if (document.pointerLockElement && document.pointerLockElement.nodeName === 'CANVAS') {
                if (!move) {
                    let listeners = (window as any).getEventListeners(document.pointerLockElement);

                    if (listeners.pointerrawupdate && listeners.pointerrawupdate.length) {
                        move = listeners.pointerrawupdate[0].listener;
                        document.pointerLockElement.removeEventListener('pointerrawupdate', move);
                    } else if (listeners.mousemove && listeners.mousemove.length) {
                        move = listeners.mousemove[0].listener;
                        document.pointerLockElement.removeEventListener('mousemove', move);
                    }

                    if (listeners.mousedown && listeners.mousedown.length) {
                        down = listeners.mousedown[0].listener;
                        document.pointerLockElement.removeEventListener('mousedown', down);
                    }

                    if (listeners.mouseup && listeners.mouseup.length) {
                        up = listeners.mouseup[0].listener;
                        document.pointerLockElement.removeEventListener('mouseup', up);
                    }

                    document.pointerLockElement.addEventListener('click', (event) => (event.target as HTMLElement).requestPointerLock());
                } else {
                    processMouseData(mouseData, lastData, {
                        move,
                        down,
                        up,
                    });
                }
            }

            lastData = mouseData;
        });
    } catch (err) {
        console.error('Failed to load mouse handler! (you can ignore this error if you are not on Windows)');
        console.error(err);
    }
}

function processMouseData(data: any, last: any, handles: { move: any, down: any, up: any }) {
    if (!last) return;

    let cx = data.wx + data.ww / 2;
    let cy = data.wy + data.wh / 2;

    let mx = Math.abs(data.x - cx) < 5 ? 0 : data.x - last.x;
    let my = Math.abs(data.y - cy) < 5 ? 0 : data.y - last.y;

    handles.move({
        isTrusted: true,
        movementX: mx,
        movementY: my,
        getCoalescedEvents: () => ([{
            isTrusted: true,
            movementX: mx,
            movementY: my,
        }])
    });

async function injectHSP() {
    await waitFor(() => window.windows?.[4] && window.windows[4].gen);

    const ogen = window.windows[4].gen;
    window.windows[4].gen = function () {
        setTimeout(() => {
            let statHolder = document.getElementById('statHolder');
            if (!statHolder) return;

            let stats = statHolder.children[2].children;

            let hits = -1;
            let headshots = -1;
            let accuracyInd = -1;

            for (let i = 0; i < stats.length; i++) {
                let stat = stats[i];
                let statName = stat.childNodes[0].textContent;

                if (statName == 'Hits') {
                    hits = Number(stat.childNodes[1].textContent.replaceAll(',', ''));
                } else if (statName == 'Headshots') {
                    headshots = Number(stat.childNodes[1].textContent.replaceAll(',', ''));
                } else if (statName == 'Accuracy') {
                    accuracyInd = i;
                }
            }

            if (hits == -1 || headshots == -1 || accuracyInd == -1) return;

            let hsp = stats[0].cloneNode(true);
            hsp.childNodes[0].textContent = 'HS%';
            hsp.childNodes[1].textContent = (headshots / hits * 100).toFixed(2) + '%';

            statHolder.children[2].insertBefore(hsp, stats[accuracyInd + 1]);
        });
        return ogen.apply(this, arguments);
    };
}
