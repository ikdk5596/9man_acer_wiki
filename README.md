# 9만 에이커 위키

[9만 에이커(90,000 Acres)](https://github.com/ikdk5596/9man_acer_wiki) 비공식 게임 정보 위키입니다. VitePress로 제작되었으며 GitHub Pages로 배포됩니다.

## 개발

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
npm run preview
```

## 배포

`main` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 자동으로 빌드하여 GitHub Pages에 배포합니다.
저장소 Settings → Pages → Source를 "GitHub Actions"로 설정해야 합니다.

## 데이터 원본

조사 원본 자료(마크다운·스크린샷)는 별도 작업 폴더 `9man_wiki`에서 관리되며, 검증이 끝난 항목만 이 저장소의 `docs/`에 정리해 반영합니다.

## 조사 원칙

- 일괄 캡처·사후 OCR로 확정하지 않고, 항목을 하나씩 열어 화면에서 직접 확인·기록합니다.
- 정책: 51/51 항목 상세 검증 완료.
- 병사: 레벨 1~6 기본 능력치와 모든 스킬을 레벨별로 검증. 현재 긴 창·장창·장검 3종 확정.
