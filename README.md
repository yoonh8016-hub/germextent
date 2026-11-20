# DiscZone Metrology — 항균 억제환 정밀 면적 측정기

디스크 확산법(Disc Diffusion Assay) 페트리 디쉬 사진에서 억제환(Inhibition Zone)의 직경과 순수 억제 면적($A = \pi r^2 - A_{\text{disc}}$)을 정밀 측정·비교·리포트하는 웹 애플리케이션입니다. 별도의 API 키나 백엔드 서버 없이 브라우저에서 100% 동작합니다.

## GitHub Pages 배포 방법 (2가지 중 선택)

### 방법 1: `/docs` 폴더로 바로 배포 (가장 간단 · Actions 불필요)
빌드된 정적 파일이 이미 `docs/` 폴더에 포함되어 있습니다.
1. 이 프로젝트 파일들(최소한 `docs/` 폴더 포함)을 GitHub 저장소에 올립니다.
2. GitHub 저장소 **Settings → Pages**로 이동합니다.
3. **Build and deployment → Source**를 `Deploy from a branch`로 두고, Branch를 **`main`** / Folder를 **`/docs`** 로 선택한 뒤 **Save**를 누릅니다.
   - 주의: Folder가 `/ (root)`로 되어 있으면 빌드 전 원본 `index.html`이 열려 하얀 화면이 나옵니다. 반드시 **`/docs`** 로 선택하세요.

### 방법 2: GitHub Actions 자동 빌드 배포
1. `src/`, `.github/`, `index.html`, `package.json`, `vite.config.ts` 등 폴더 구조를 그대로 유지한 채 GitHub에 올립니다.
2. **Settings → Pages → Source**를 **`GitHub Actions`** 로 변경합니다.
