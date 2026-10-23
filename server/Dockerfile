# 서식 유지 변환 서버 (LibreOffice + H2Orestart + 한글 글꼴 + Node.js)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    HOME=/tmp

# - libreoffice-writer-nogui: 문서 변환 (화면 없는 버전)
# - libreoffice-java-common + JRE: HWP를 여는 H2Orestart 확장이 Java로 동작합니다. 둘 다 없으면 HWP가 열리지 않습니다.
# - fonts-nanum, fonts-noto-cjk: 한글 글꼴. 없으면 PDF에서 한글이 깨집니다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui libreoffice-java-common default-jre-headless \
      fonts-nanum fonts-noto-cjk \
      nodejs ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# H2Orestart (HWP/HWPX를 LibreOffice에서 열게 해 주는 확장, GPL-3.0)
# 저장소에 파일을 넣지 않고 빌드할 때 내려받습니다. 버전을 바꾸려면 커밋 값을 바꾸세요.
ARG H2ORESTART_COMMIT=2a35d9e1bf6fb67fcde4f4c42d89134d65f9df55
RUN curl -fsSL -o /tmp/H2Orestart.oxt \
      "https://github.com/ebandal/H2Orestart/raw/${H2ORESTART_COMMIT}/dist/H2Orestart.oxt" \
 && unopkg add --shared /tmp/H2Orestart.oxt \
 && rm /tmp/H2Orestart.oxt

WORKDIR /app
COPY server.js package.json ./

# 보안을 위해 관리자(root)가 아닌 일반 사용자로 실행합니다.
USER ubuntu
EXPOSE 10000
CMD ["node", "server.js"]
