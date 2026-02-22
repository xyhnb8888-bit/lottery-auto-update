const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// JSONBin配置 - 使用您已有的
const BIN_ID = '699ad0ceae596e708f3ef973';
const API_KEY = '$2a$10$lCMC/yzMB2MgGqYevDY2suIexlV43A3gU8gLd.I9BqhuC8BoXuQX2';
const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// 工具函数
function getTypeFromDigit(digit) {
    const map = {0:'小双',1:'小单',2:'小双',3:'小单',4:'小双',5:'大单',6:'大双',7:'大单',8:'大双',9:'大单'};
    return map[digit];
}

function getOppositeType(type) {
    const map = {'小单':'大双','小双':'大单','大单':'小双','大双':'小单'};
    return map[type];
}

function extractHourMinute(timeStr) {
    const timePart = timeStr.split(' ')[1];
    const [hour, minute] = timePart.split(':').map(Number);
    return { hour, minute };
}

function getTypeFromSum(sum) {
    const num = parseInt(sum);
    const size = num <= 13 ? '小' : '大';
    const parity = num % 2 === 0 ? '双' : '单';
    return size + parity;
}

// 获取最新开奖
async function fetchLatestLottery() {
    const res = await fetch('https://pc28.help/kj.json?limit=1&_=' + Date.now());
    const data = await res.json();
    return data.data[0];
}

// 获取当前历史数据
async function getHistory() {
    const res = await fetch(`${BIN_URL}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
    });
    const data = await res.json();
    return data.record || [];
}

// 保存历史数据
async function saveHistory(history) {
    await fetch(BIN_URL, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': API_KEY
        },
        body: JSON.stringify(history)
    });
}

// 上次处理的期号
let lastProcessedPeriod = null;

// 主循环
async function updateData() {
    console.log('[' + new Date().toLocaleString() + '] 检查新开奖...');
    
    try {
        const latest = await fetchLatestLottery();
        
        if (latest.qihao === lastProcessedPeriod) {
            console.log('期号未变，跳过');
            return;
        }
        
        const history = await getHistory();
        const exists = history.some(h => h.period === latest.qihao);
        
        if (!exists && history.length > 0) {
            const lastItem = history[0];
            
            const { hour, minute } = extractHourMinute(latest.opentime);
            const max = Math.max(hour, minute);
            const min = Math.min(hour, minute);
            const diff = max - min;
            const lastDigit = diff % 10;
            const type = getTypeFromDigit(lastDigit);
            const nextKill = getOppositeType(type);
            
            const sum = parseInt(latest.sum);
            const actualType = getTypeFromSum(sum);
            const correct = actualType !== lastItem.kill;
            
            const newHistory = [{
                period: lastItem.period,
                time: lastItem.time,
                kill: lastItem.kill,
                result: `${latest.opennum}=${sum} ${actualType}`,
                correct: correct
            }, ...history];
            
            if (newHistory.length > 30) newHistory.pop();
            await saveHistory(newHistory);
            
            console.log(`✅ 新开奖 ${latest.qihao} 已记录`);
        }
        
        lastProcessedPeriod = latest.qihao;
        
    } catch (err) {
        console.error('错误:', err.message);
    }
}

// 每5分钟运行一次
setInterval(updateData, 5 * 60 * 1000);

// 启动时立即运行
updateData();

// 静态文件服务
app.use(express.static('public'));

// API获取历史
app.get('/api/history', async (req, res) => {
    const history = await getHistory();
    res.json(history);
});

app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});
