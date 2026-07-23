// Playwright 브라우저 테스트 설정
// - jest(단위/통합 테스트, tests/*.test.js)와는 완전히 분리된 별도 테스트 러너다.
//   testMatch를 *.pw.js로 한정해 jest의 기본 testMatch(*.test.js/*.spec.js)와
//   서로의 테스트 파일을 침범하지 않도록 한다.
// - 실행: npm install -D @playwright/test && npx playwright install chromium && npx playwright test

module.exports = {
  testDir: './tests/e2e',
  testMatch: '**/*.pw.js',
  timeout: 30000,
  fullyParallel: false,
  use: {
    // 이 프로젝트가 배포/실행되는 컨테이너 환경 중에는 Chromium 자체 샌드박스에 필요한
    // 커널 네임스페이스 권한이 없는 경우가 있어(예: 일부 CI/Docker), --no-sandbox를 지정한다.
    launchOptions: {
      args: ['--no-sandbox'],
    },
  },
};
