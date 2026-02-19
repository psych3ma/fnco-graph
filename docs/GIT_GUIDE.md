# Git 커밋 가이드

## 1. Git 저장소 초기화 (최초 1회)

```bash
cd /Users/coruscatio/Desktop/demo/fnco-graph
git init
```

## 2. 파일 스테이징 및 커밋

### 기본 커밋 흐름

```bash
# 1. 변경된 파일 확인
git status

# 2. 모든 변경사항 스테이징
git add .

# 또는 특정 파일만 스테이징
git add backend/
git add frontend/
git add requirements.txt

# 3. 커밋 메시지와 함께 커밋
git commit -m "프로젝트 초기 설정: Streamlit + FastAPI + Neo4j + vis.js 기반 그래프 DB 시각화 및 챗봇 서비스"
```

### 커밋 메시지 예시

```bash
# 초기 커밋
git commit -m "Initial commit: Graph DB visualization and chatbot service"

# 기능 추가
git commit -m "feat: 그래프 시각화 기능 추가"
git commit -m "feat: 챗봇 기능 구현"

# 버그 수정
git commit -m "fix: Neo4j 연결 오류 수정"

# 문서 업데이트
git commit -m "docs: README 업데이트"

# 리팩토링
git commit -m "refactor: API 클라이언트 코드 개선"
```

## 3. GitHub 저장소 연결 및 푸시

### 저장소 초기화 및 첫 커밋

```bash
cd /Users/coruscatio/Desktop/demo/fnco-graph

# 1. Git 저장소 초기화
git init

# 2. 모든 파일 스테이징
git add .

# 3. 첫 커밋
git commit -m "Initial commit: Graph DB visualization and chatbot service"

# 4. 브랜치 이름을 main으로 설정
git branch -M main
```

### 원격 저장소 연결 및 푸시

```bash
# 5. 원격 저장소 추가
git remote add origin https://github.com/psych3ma/fnco-graph.git

# 6. 원격 저장소 확인
git remote -v

# 7. GitHub에 푸시
git push -u origin main
```

**참고**: 첫 푸시 시 GitHub 인증이 필요할 수 있습니다:
- Personal Access Token 사용 또는
- GitHub CLI (`gh auth login`) 사용

## 4. 유용한 Git 명령어

```bash
# 커밋 히스토리 확인
git log
git log --oneline

# 변경사항 확인 (스테이징 전)
git diff

# 스테이징된 변경사항 확인
git diff --staged

# 마지막 커밋 수정 (메시지 변경)
git commit --amend -m "새로운 커밋 메시지"

# 파일 삭제 추적
git rm 파일명

# .gitignore에 추가된 파일 제거 (이미 추적 중인 경우)
git rm --cached .env
```

## 5. 빠른 커밋 스크립트 (선택사항)

프로젝트 루트에 `commit.sh` 파일을 만들어 사용할 수 있습니다:

```bash
#!/bin/bash
git add .
git commit -m "$1"
```

사용법:
```bash
chmod +x commit.sh
./commit.sh "커밋 메시지"
```

## 6. 현재 상태 확인

```bash
# Git 저장소 상태
git status

# 브랜치 확인
git branch

# 원격 저장소 확인
git remote -v
```
