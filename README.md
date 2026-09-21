# 9만 에이커 위키

[9만 에이커(90,000 Acres)](https://github.com/ikdk5596/9man_acer_wiki) 비공식 게임 정보 위키입니다. VitePress로 제작되었으며 Firebase Hosting의 `acer-wiki` 프로젝트로 배포합니다. 이전 GitHub Pages 빌드도 유지합니다.

## 작업 현황

완료된 작업, 미완성 기능, 파일 역할과 정리 대상은 **[STATUS.md](STATUS.md)**에서 관리합니다. 정책 51종·병사 26종·장비 66종·영웅 59종을 Firebase Hosting에 배포했습니다. 게시판과 조사 원본은 로컬에 보존하며, 미완성 게시판은 배포에서 제외합니다.

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

도감 전체의 빌드 결과·목록 연결·이미지는 `python scripts/check_catalog_pages.py`로 검사합니다. Firebase 루트 빌드 후에는 `--base /`를 지정합니다.

## 배포

### Firebase Hosting

Firebase CLI에 로그인한 상태에서 실행합니다.

```bash
npm run deploy:firebase
```

배포 전 `build:firebase`와 `check:firebase`가 자동으로 실행됩니다. Firebase 빌드는 루트(`/`) 경로를 사용하며, `acer-wiki` 프로젝트의 `wiki` Hosting 대상에만 배포합니다. 설문 프로젝트는 변경하지 않습니다.

이 명령은 Hosting만 배포합니다. Authentication, Firestore, Storage 및 결제는 별도 설정·검증 대상입니다. 공개 사이트에는 게시판의 Google 로그인과 사진 업로드 기능을 아직 배포하지 않았습니다.

기본 빌드는 게시판을 제외합니다. `npm run dev:guides`는 게시판과 demo 에뮬레이터 연결을 명시적으로 활성화합니다. Firebase 빌드는 게시판 제외를 강제하며, 배포 전 검사에서 게시판 경로·번들·링크가 발견되면 차단합니다. 배포 후에는 `node scripts/verify_firebase_release.mjs`로 운영 HTML·자산 일치와 게시판 404 응답을 확인합니다.

### 기존 GitHub Pages

`main` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 자동으로 빌드하여 GitHub Pages에 배포합니다.
저장소 Settings → Pages → Source를 "GitHub Actions"로 설정해야 합니다.
`npm run build`는 기존 `/9man_acer_wiki/` 경로를 유지합니다. Firebase 자동배포는 아직 설정하지 않았으며 위 명령으로 수동 배포합니다.

## 데이터 원본

조사 원본 자료(마크다운·스크린샷)는 별도 작업 폴더 `9man_wiki`에서 관리되며, 검증이 끝난 항목만 이 저장소의 `docs/`에 정리해 반영합니다.

### 공개 이미지와 원본 보관

- `docs/public/images/`에는 현재 페이지가 사용하는 이미지 261개만 둡니다. 미사용 이미지 516개와 과거 크롭 도구 5개는 `../9man_wiki/wiki_assets/9man_acer_wiki_archive/`로 옮겼습니다. 기존 저장소 상대 경로와 파일 바이트를 보존했으며 `manifest.json`에 SHA-256을 기록했습니다.
- 병사 원본 `_roster_raw2/`와 영웅 원본 `hero_tmp/`는 위 보관 폴더의 `docs/public/images/` 아래에 있습니다. 폴더 이름만 임시처럼 보일 뿐 재생성에 필요한 원본입니다.
- 병사 대표 이미지: `python scripts/build_soldier_detail_icons.py`. 색상 영역으로 26개를 생성합니다. 장창·긴 창·장검 스킬: `python scripts/build_soldier_skill_icons.py`. 스킬 원본은 `../9man_wiki/wiki_assets/soldier_skill_retakes/`입니다.
- 영웅 전체 재생성: `python scripts/build_hero_catalog.py`. 원본 보관 폴더와 Pillow·NumPy·SciPy가 필요합니다. 일반 위키 빌드·배포에는 이미지 재생성이 필요하지 않습니다.
- 과거 크롭 도구는 보관용이며 실행하지 않습니다. 고정 좌표 기반 도구로 새 이미지를 덮어쓰지 마세요.
- `python -B -m unittest discover -s tests -p test_public_assets.py`는 미사용 이미지·원본 폴더의 공개 영역 재유입을 검사합니다. Firebase 배포 전에도 자동 실행됩니다. 전체 Python 검사 중 색상 크롭 검사는 별도 원본 폴더가 필요합니다.

### 영웅 재능 수정

- 영웅 59명의 재능 원본은 `docs/talents/<영웅명>.md`에 있습니다. 초급·중급·고급 재능과 중첩 횟수는 이 파일에서 수정합니다.
- `npm run build`와 Firebase 배포 빌드는 재능 원본을 `docs/hero/`의 해당 영웅 상세 페이지에 자동 반영합니다. 기존 능력치·고유 스킬·이미지는 유지합니다.
- 개발 서버에서 확인할 때는 원본 수정 후 `python scripts/sync_hero_talents.py`를 실행합니다. `--check` 옵션은 변경 없이 동기화 상태만 검사합니다.
- 재능 원본 폴더는 독립 페이지로 배포하지 않으며, 영웅 상세의 **재능 → 초급재능·중급재능·고급재능**에서 확인합니다.
- `python -m unittest discover -s tests -p test_hero_talents.py`로 59명 전체의 원문·중첩 횟수 일치를 검사합니다. 동기화에는 Python 3 표준 라이브러리만 사용합니다.

## 조사 원칙

- 일괄 캡처·사후 OCR로 확정하지 않고, 항목을 하나씩 열어 화면에서 직접 확인·기록합니다.
- 정책: 51/51 항목 상세 검증 완료.
- 병사: GitHub 최종 내용을 기준으로 상세 페이지 26종 작성 완료. 이번 병합에서는 수치·스킬을 임의로 바꾸지 않았으며, 게임 화면의 원본 전수 재검증은 수행하지 않았습니다.
- 장비·영웅을 포함한 로컬 파일 수량과 확인 범위는 `STATUS.md`를 참조하세요.
