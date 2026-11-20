# DiscZone Metrology — 항균 억제환 정밀 면적 측정기

디스크 확산법(Disc Diffusion Assay) 페트리 디쉬 사진에서 억제환(Inhibition Zone)의 직경과 순수 억제 면적($A = \pi r^2 - A_{\text{disc}}$)을 정밀 측정·비교·리포트하는 웹 애플리케이션입니다. 별도의 API 키나 백엔드 서버 없이 브라우저에서 100% 동작합니다.

## GitHub Pages 배포 방법

1. 이 프로젝트의 **폴더 구조(`src/`, `.github/`, `index.html`, `package.json`, `vite.config.ts` 등)를 그대로 유지한 채** GitHub 저장소에 업로드합니다.
   - 주의: `src/` 안의 파일들을 최상위 루트로 꺼내서 올리면 빌드가 실패합니다. `src` 폴더와 `.github` 폴더가 그대로 보이도록 올려주세요.
2. GitHub 저장소의 **Settings → Pages** 메뉴로 이동합니다.
3. **Build and deployment → Source**를 `Deploy from a branch`가 아닌 **`GitHub Actions`**로 변경합니다.
4. `main`(또는 `master`) 브랜치에 코드가 올라가면 자동으로 `npm install && npm run build`가 실행되어 `dist/`가 배포됩니다.

## 로컬 실행

```bash
npm install
npm run dev
```
