#!/usr/bin/env python3
"""
Neo4j 연결 테스트 스크립트
Neo4j 전문가 CTO 관점에서 작성된 진단 도구

개선사항:
- 안전한 데이터 타입 처리
- 다양한 Neo4j 버전 호환성
- 상세한 에러 메시지
- 성능 최적화 권장사항
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from neo4j import GraphDatabase
from neo4j.exceptions import (
    AuthError,
    ServiceUnavailable,
    TransientError,
    ClientError,
    CypherSyntaxError
)

# 프로젝트 루트 디렉토리 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

load_dotenv()

def test_connection():
    """Neo4j 연결 테스트"""
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "")
    
    print("=" * 60)
    print("Neo4j 연결 테스트")
    print("=" * 60)
    print(f"URI: {uri}")
    print(f"User: {user}")
    print(f"Password: {'*' * len(password) if password else '(비어있음)'}")
    print()
    
    # URI 검증
    if not uri:
        print("❌ ERROR: NEO4J_URI가 설정되지 않았습니다.")
        return False
    
    if not password:
        print("❌ ERROR: NEO4J_PASSWORD가 설정되지 않았습니다.")
        return False
    
    # SSL 연결 확인
    is_ssl = uri.startswith("neo4j+s://") or uri.startswith("bolt+s://")
    print(f"SSL 연결: {'예' if is_ssl else '아니오'}")
    
    try:
        print("\n1. 드라이버 생성 중...")
        driver = GraphDatabase.driver(
            uri,
            auth=(user, password),
            max_connection_lifetime=3600,
            max_connection_pool_size=50,
            connection_acquisition_timeout=30,
            connection_timeout=10
        )
        print("   ✅ 드라이버 생성 성공")
        
        print("\n2. 연결 테스트 중...")
        with driver.session() as session:
            result = session.run("RETURN 1 as test")
            record = result.single()
            if record and record["test"] == 1:
                print("   ✅ 연결 테스트 성공")
            else:
                print("   ❌ 연결 테스트 실패: 예상치 못한 응답")
                return False
        
        print("\n3. 서버 정보 조회 중...")
        with driver.session() as session:
            result = session.run("CALL dbms.components() YIELD name, versions, edition")
            components = []
            for record in result:
                components.append({
                    "name": record["name"],
                    "version": record["versions"][0] if record["versions"] else "unknown",
                    "edition": record["edition"]
                })
            
            print("   서버 정보:")
            for comp in components:
                print(f"     - {comp['name']}: {comp['version']} ({comp['edition']})")
        
        print("\n4. 데이터베이스 통계 조회 중...")
        with driver.session() as session:
            # 노드 수
            result = session.run("MATCH (n) RETURN count(n) as node_count")
            node_count = result.single()["node_count"]
            print(f"   노드 수: {node_count:,}")
            
            # 관계 수
            result = session.run("MATCH ()-[r]->() RETURN count(r) as rel_count")
            rel_count = result.single()["rel_count"]
            print(f"   관계 수: {rel_count:,}")
            
            # 라벨별 통계
            result = session.run("""
                MATCH (n)
                UNWIND labels(n) as label
                WITH label, count(*) as count
                ORDER BY count DESC
                RETURN collect({label: label, count: count}) as label_counts
            """)
            label_counts = result.single()["label_counts"]
            print(f"   라벨 종류: {len(label_counts)}")
            for item in label_counts[:10]:  # 상위 10개만 표시
                print(f"     - {item['label']}: {item['count']:,}")
        
        print("\n5. 인덱스 확인 중...")
        with driver.session() as session:
            result = session.run("SHOW INDEXES")
            indexes = []
            for record in result:
                # properties 필드 안전하게 처리
                properties_raw = record.get("properties")
                if properties_raw is None:
                    properties = []
                elif isinstance(properties_raw, list):
                    properties = properties_raw
                elif isinstance(properties_raw, str):
                    properties = [properties_raw]
                else:
                    # 다른 타입인 경우 문자열로 변환 시도
                    try:
                        properties = list(properties_raw) if hasattr(properties_raw, '__iter__') else [str(properties_raw)]
                    except:
                        properties = [str(properties_raw)]
                
                indexes.append({
                    "name": record.get("name", "unknown"),
                    "type": record.get("type", "unknown"),
                    "state": record.get("state", "unknown"),
                    "properties": properties
                })
            
            if indexes:
                print(f"   인덱스 수: {len(indexes)}")
                for idx in indexes[:10]:  # 상위 10개만 표시
                    # properties 안전하게 포맷팅
                    if idx["properties"] and len(idx["properties"]) > 0:
                        props = ", ".join(str(p) for p in idx["properties"])
                    else:
                        props = "(속성 없음)"
                    print(f"     - {idx['name']} ({idx['type']}): {props} [{idx['state']}]")
            else:
                print("   ⚠️  인덱스가 없습니다. 성능 최적화를 위해 인덱스 생성을 권장합니다.")
        
        print("\n6. 샘플 쿼리 테스트 중...")
        with driver.session() as session:
            # Company 노드 조회
            result = session.run("MATCH (n:Company) RETURN n LIMIT 1")
            company = result.single()
            if company:
                print("   ✅ Company 노드 조회 성공")
                node = company["n"]
                print(f"     샘플 노드 ID: {node.get('bizno', node.get('id', 'unknown'))}")
            else:
                print("   ⚠️  Company 노드가 없습니다.")
            
            # Person 노드 조회
            result = session.run("MATCH (n:Person) RETURN n LIMIT 1")
            person = result.single()
            if person:
                print("   ✅ Person 노드 조회 성공")
                node = person["n"]
                print(f"     샘플 노드 ID: {node.get('personId', node.get('id', 'unknown'))}")
            else:
                print("   ⚠️  Person 노드가 없습니다.")
            
            # HOLDS_SHARES 관계 조회
            result = session.run("MATCH ()-[r:HOLDS_SHARES]->() RETURN r LIMIT 1")
            rel = result.single()
            if rel:
                print("   ✅ HOLDS_SHARES 관계 조회 성공")
            else:
                print("   ⚠️  HOLDS_SHARES 관계가 없습니다.")
        
        print("\n" + "=" * 60)
        print("✅ 모든 테스트 통과!")
        print("=" * 60)
        
        driver.close()
        return True
        
    except AuthError as e:
        print(f"\n❌ 인증 실패:")
        print(f"   {str(e)}")
        print("\n해결 방법:")
        print("   1. NEO4J_USER와 NEO4J_PASSWORD를 확인하세요.")
        print("   2. Neo4j Aura의 경우 비밀번호가 올바른지 확인하세요.")
        return False
        
    except ServiceUnavailable as e:
        print(f"\n❌ 서버 연결 실패:")
        print(f"   {str(e)}")
        print("\n해결 방법:")
        print("   1. Neo4j 서버가 실행 중인지 확인하세요.")
        print("   2. URI가 올바른지 확인하세요.")
        print("   3. 네트워크 연결을 확인하세요.")
        print("   4. 방화벽 설정을 확인하세요.")
        if is_ssl:
            print("   5. SSL 인증서 문제일 수 있습니다.")
        return False
        
    except Exception as e:
        print(f"\n❌ 예상치 못한 오류:")
        print(f"   타입: {type(e).__name__}")
        print(f"   메시지: {str(e)}")
        import traceback
        print("\n상세 오류:")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)
