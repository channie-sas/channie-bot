// C:\dev\personal\channie bot\ecosystem.config.js
'use strict';
const path = require('path');

const baseDir = 'C:\\dev\\personal\\channie bot'; // 윈도우 경로는 역슬래시 이스케이프

module.exports = {
  apps: [
    {
      name: 'discord-bot',
      script: path.join(baseDir, 'index.js'),
      cwd: baseDir,

      // Node 옵션 (디버깅에 유용)
      node_args: '--enable-source-maps --trace-warnings --trace-uncaught',

      // 실행/재시작 정책
      instances: 1,            // 멀티코어 분산할 거면 'max' 또는 숫자
      exec_mode: 'fork',       // 상태 공유 필요없으면 fork 모드면 충분
      watch: false,            // 운영에선 false 권장(윈도우 watch 비용 큼)
      autorestart: true,
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '400M', // 메모리 임계 도달 시 재시작

      // 환경변수
      env: { NODE_ENV: 'production' },

      // 로그/프로세스 파일 (절대경로로 고정)
      out_file: path.join(baseDir, 'logs', 'out.log'),
      error_file: path.join(baseDir, 'logs', 'err.log'),
      pid_file: path.join(baseDir, 'logs', 'pm2.pid'),
      time: true,
    },
  ],
};
