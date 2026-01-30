
import re

def parse_html(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    stack = []
    
    container_range = None
    gamescreen_range = None
    gameover_range = None
    
    container_depth = -1
    gamescreen_depth = -1
    
    events = []

    for i, line in enumerate(lines):
        line_num = i + 1
        clean_line = re.sub(r'<!--.*?-->', '', line)
        
        # Simple tag finder: finds <div...> or </div>
        # Note: This handles multiple tags on one line crudely but effectively for this indentation style
        tags = re.finditer(r'(<div[^>]*>)|(</div>)', clean_line)
        
        for match in tags:
            tag = match.group()
            
            if tag == '</div>':
                if not stack:
                    events.append(f"ERROR: Extra closing div at {line_num}")
                    continue
                    
                popped = stack.pop()
                if popped['type'] == 'container':
                    container_range = (popped['line'], line_num)
                    events.append(f"CONTAINER CLOSED at {line_num}")
                elif popped['type'] == 'game-screen':
                    gamescreen_range = (popped['line'], line_num)
                    events.append(f"GAME-SCREEN CLOSED at {line_num}")
                elif popped['type'] == 'game-over-screen':
                    gameover_range = (popped['line'], line_num)
                    events.append(f"GAME-OVER-SCREEN CLOSED at {line_num}")
            else:
                # Opening div
                div_info = {'line': line_num, 'id': None, 'class': None, 'type': 'div'}
                
                id_match = re.search(r'id=["\']([^"\']*)["\']', tag)
                if id_match:
                    div_info['id'] = id_match.group(1)
                
                class_match = re.search(r'class=["\']([^"\']*)["\']', tag)
                if class_match:
                    div_info['class'] = class_match.group(1)
                
                # Identify key elements
                if div_info['class'] == 'container':
                    div_info['type'] = 'container'
                    events.append(f"CONTAINER OPENED at {line_num}")
                elif div_info['id'] == 'game-screen':
                    div_info['type'] = 'game-screen'
                    # Check parent
                    parent = stack[-1] if stack else None
                    parent_type = parent['type'] if parent else 'ROOT'
                    events.append(f"GAME-SCREEN OPENED at {line_num} (Parent: {parent_type})")
                elif div_info['id'] == 'game-over-screen':
                    div_info['type'] = 'game-over-screen'
                    parent = stack[-1] if stack else None
                    parent_type = parent['type'] if parent else 'ROOT'
                    events.append(f"GAME-OVER-SCREEN OPENED at {line_num} (Parent: {parent_type})")
                    
                stack.append(div_info)

    print("--- PARSE EVENTS ---")
    for e in events:
        print(e)
    
    print("\n--- UNCLOSED TAGS ---")
    for item in stack[-5:]:
        print(f"Unclosed {item['type']} (id={item['id']}, class={item['class']}) from line {item['line']}")

parse_html('public/index.html')
