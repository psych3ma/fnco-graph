"""Streamlit 메인 애플리케이션"""
import streamlit as st
import json
from api_client import get_graph_data, search_graph, send_chat_message
from utils import init_session_state, format_node_for_vis, format_edge_for_vis

# 페이지 설정
st.set_page_config(
    page_title="Graph DB Visualization & Chatbot",
    page_icon="🕸️",
    layout="wide"
)

# 세션 상태 초기화
init_session_state()

# 타이틀
st.title("🕸️ Graph Database Visualization & Chatbot")
st.markdown("---")

# 사이드바
with st.sidebar:
    st.header("⚙️ 설정")
    
    # 그래프 데이터 로드 옵션
    load_option = st.radio(
        "데이터 로드 방식",
        ["전체 그래프", "검색"],
        key="load_option"
    )
    
    if load_option == "전체 그래프":
        limit = st.slider("노드 수 제한", 10, 500, 100, key="graph_limit")
        if st.button("그래프 로드", type="primary"):
            with st.spinner("그래프 데이터를 불러오는 중..."):
                graph_data = get_graph_data(limit)
                st.session_state.graph_data = graph_data
                st.success(f"{len(graph_data.get('nodes', []))}개 노드, {len(graph_data.get('edges', []))}개 관계 로드됨")
    
    else:  # 검색
        search_term = st.text_input("검색어 입력", key="search_input")
        search_limit = st.slider("검색 결과 수", 10, 200, 50, key="search_limit")
        if st.button("검색", type="primary") and search_term:
            with st.spinner("검색 중..."):
                graph_data = search_graph(search_term, search_limit)
                st.session_state.graph_data = graph_data
                st.success(f"{len(graph_data.get('nodes', []))}개 노드, {len(graph_data.get('edges', []))}개 관계 발견")

# 메인 영역 - 탭으로 분리
tab1, tab2 = st.tabs(["📊 그래프 시각화", "💬 챗봇"])

with tab1:
    st.header("그래프 시각화")
    
    if st.session_state.graph_data and len(st.session_state.graph_data.get("nodes", [])) > 0:
        # vis.js를 위한 데이터 포맷팅
        nodes = format_node_for_vis(st.session_state.graph_data.get("nodes", []))
        edges = format_edge_for_vis(st.session_state.graph_data.get("edges", []))
        
        # HTML 컴포넌트 생성
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
            <style>
                #graph-container {{
                    width: 100%;
                    height: 600px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }}
            </style>
        </head>
        <body>
            <div id="graph-container"></div>
            <script type="text/javascript">
                const nodes = new vis.DataSet({json.dumps(nodes)});
                const edges = new vis.DataSet({json.dumps(edges)});
                
                const data = {{ nodes: nodes, edges: edges }};
                
                const options = {{
                    nodes: {{
                        shape: 'dot',
                        size: 16,
                        font: {{ size: 14 }},
                        borderWidth: 2,
                        shadow: true
                    }},
                    edges: {{
                        width: 2,
                        color: {{ inherit: 'from' }},
                        smooth: {{ type: 'continuous' }},
                        arrows: {{ to: {{ enabled: true, scaleFactor: 0.5 }} }}
                    }},
                    physics: {{
                        enabled: true,
                        stabilization: {{ enabled: true, iterations: 200 }}
                    }},
                    interaction: {{
                        hover: true,
                        tooltipDelay: 200,
                        zoomView: true,
                        dragView: true
                    }}
                }};
                
                const container = document.getElementById('graph-container');
                const network = new vis.Network(container, data, options);
            </script>
        </body>
        </html>
        """
        
        st.components.v1.html(html_content, height=620)
        
        # 그래프 통계
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("노드 수", len(nodes))
        with col2:
            st.metric("관계 수", len(edges))
        with col3:
            node_types = set(node.get("label", "Unknown") for node in nodes)
            st.metric("노드 타입", len(node_types))
    else:
        st.info("👈 사이드바에서 그래프 데이터를 로드하거나 검색해주세요.")

with tab2:
    st.header("챗봇")
    st.markdown("그래프 데이터베이스에 대해 질문하세요!")
    
    # 채팅 히스토리 표시
    for chat in st.session_state.chat_history:
        with st.chat_message(chat["role"]):
            st.write(chat["content"])
    
    # 사용자 입력
    user_input = st.chat_input("메시지를 입력하세요...")
    
    if user_input:
        # 사용자 메시지 표시
        with st.chat_message("user"):
            st.write(user_input)
        
        st.session_state.chat_history.append({"role": "user", "content": user_input})
        
        # 챗봇 응답 생성
        with st.chat_message("assistant"):
            with st.spinner("답변 생성 중..."):
                response = send_chat_message(user_input, {"include_graph": False})
                bot_response = response.get("response", "응답을 생성할 수 없습니다.")
                st.write(bot_response)
        
        st.session_state.chat_history.append({"role": "assistant", "content": bot_response})
        
        # 채팅 히스토리 초기화 버튼
        if st.button("채팅 히스토리 초기화"):
            st.session_state.chat_history = []
            st.rerun()
