import argparse
import json
import os
import sys

import openai
import psycopg2
from dotenv import load_dotenv


def save_error_report(id, gadm_uid, hierarchy, feedback):
    try:
        with open(errors_file, "a") as file:
            file.write(f"AdmDivision ID: {id}, GADM ID: {gadm_uid}\n{hierarchy}\n{feedback}\n\n")
    except IOError as e:
        print(f"Error during file ({errors_file}) operation: {e}")


# Write the checked region IDs to a file to avoid checking them again
# Write just commma-separated values, no newlines
def add_to_cache(ids):
    if not ids:
        return
    try:
        with open(cache_file, "a") as file:
            if os.stat(cache_file).st_size > 0:
                file.write(",")
            # ids is a list of integers, so we need to convert it to a string
            ids = [str(id) for id in ids]
            file.write(",".join(ids))
    except IOError as e:
        print(f"Error during file ({cache_file}) operation: {e}")


# Function to color text red in terminal
def red_text(text):
    return f"\033[38;5;9m{text}\033[0m"

def orange_text(text):
    return f"\033[38;5;208m{text}\033[0m"

def slight_yellow_text(text):
    return f"\033[38;5;220m{text}\033[0m"

def green_text(text):
    return f"\033[92m{text}\033[0m"

def print_error_title(title, severity):
    if severity == "high":
        print(red_text(title))
    elif severity == "medium":
        print(orange_text(title))
    elif severity == "low":
        print(slight_yellow_text(title))


def load_cache():
    try:
        with open(cache_file, "r") as file:
            return file.read().split(",")
    except FileNotFoundError:
        return None
    except IOError as e:
        print(f"Error during file ({cache_file}) operation: {e}")
    return None


def get_hierarchy(cur, id):
    path_to_root = []
    original_parent_id = None
    original_id = id

    # Building the path from the given region up to the root
    while id:
        cur.execute("SELECT name, parent_id FROM adm_divisions WHERE id = %s", (id,))
        row = cur.fetchone()
        if row:
            name, parent_id = row
            path_to_root.insert(0, name)  # Insert at the beginning to build the path bottom-up.
            if original_parent_id is None:
                original_parent_id = parent_id
            id = parent_id
        else:
            break

    # Fetching siblings of the parent region of the original region
    siblings = []
    siblings_ids = []
    if original_parent_id is not None:
        cur.execute("SELECT name, id FROM adm_divisions WHERE parent_id = %s AND id != %s",
                    (original_parent_id, original_id))
        rows = cur.fetchall()
        siblings = [row[0] for row in rows]
        siblings_ids = [row[1] for row in rows]

    # Constructing the final hierarchy string
    hierarchy_string = " -> ".join(path_to_root)
    if siblings:
        hierarchy_string += ", " + ", ".join(siblings)

    return hierarchy_string, siblings_ids


errors_file = "error_reports.txt"
cache_file = ".checked_cache"

# Read the DB credentials from .env files.
env_files = [".env", ".env.development", ".env.production", ".env.local"]
for env_file in env_files:
    if os.path.exists(env_file):
        print(f"Loading environment variables from {env_file}")
        load_dotenv(env_file)

db_name = os.getenv("DB_NAME")
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_host = os.getenv("DB_HOST", 'localhost')
openai.api_key = os.getenv("OPENAI_API_KEY")

# Check that the DB credentials were provided
if not all([db_name, db_user, db_password, openai.api_key]):
    print("Error: DB_NAME, DB_USER, DB_PASSWORD, and OPENAI_API_KEY must be provided in .env")
    sys.exit(1)

# Setup argument parser
parser = argparse.ArgumentParser(description="Script to validate administrative divisions hierarchies with OpenAI API.")
parser.add_argument('-c', '--cheap', action='store_true', help='Use the gpt-3.5-turbo model instead of gpt-4.')
parser.add_argument('-n', '--num-divisions', type=int, default=10, help='Number of random divisions to check.')

# Parse arguments
args = parser.parse_args()

# Use the specified model based on the --cheap flag
model_to_use = "gpt-3.5-turbo-1106" if args.cheap else "gpt-4-1106-preview"

# Use the specified number of regions to check
num_divisions_to_check = args.num_divisions

# Connect to your database
conn = psycopg2.connect(dbname=db_name, user=db_user, password=db_password, host=db_host)
cur = conn.cursor()

checked_divisions = load_cache()

# Generate a WHERE clause to exclude the divisions that were already checked
where_clause = "WHERE id NOT IN (" + ",".join(checked_divisions) + ")" if checked_divisions else ""
# Generate a list of random division IDs to check, excluding the ones that were already checked, by SQL
cur.execute(f"""
    SELECT id FROM adm_divisions
    {where_clause}
    ORDER BY random()
    LIMIT {num_divisions_to_check}
""")
ids = [row[0] for row in cur.fetchall()]

error_mark = "WARNING"

initial_prompt = (
 "Check out our region hierarchy. It is very important to me. Reply in JSON."
 "If it's perfect, reply with `{\"status\": \"valid\"}'."
 "Notice an issue? Point it out with `{\"status\": \"error\", \"severity\": \"low|medium|high\", \"detail\": \"Explain the issue\"}`."
 "The hierarchy is provided in the following format: Parent -> Parent -> Parent -> Sibling, Sibling, Sibling."
)

client = openai.Client(api_key=openai.api_key)

input_tokens = 0
output_tokens = 0

# Validate region hierarchy data for selected divisions
def valid_schema(json_feedback):
    if "status" not in json_feedback:
        return False
    if json_feedback["status"] == "error":
        if "severity" not in json_feedback:
            return False
        if json_feedback["severity"] not in ["low", "medium", "high"]:
            return False
        if "detail" not in json_feedback:
            return False
    elif json_feedback["status"] == "valid":
        if "detail" in json_feedback:
            return False
    else:
        return False
    return True


for id in ids:
    cur.execute("SELECT gadm_uid FROM adm_divisions WHERE id = %s", (id,))
    result = cur.fetchone()  # Store the result of fetchone
    gadm_uid = result[0] if result else None  # Check if result is not None before subscripting
    hierarchy, siblings = get_hierarchy(cur, id)
    print(f"{'-' * 80}")
    print(f"Validating division hierarchy: {hierarchy}")  # Tab at the beginning for separation
    try:
        completion = client.chat.completions.create(
            model=model_to_use,
            messages=[
                {"role": "system", "content": initial_prompt},
                {"role": "user", "content": hierarchy}
            ],
            response_format={"type": "json_object"},
            n=1,
            max_tokens=150
        )
        feedback = completion.choices[0].message.content
        input_tokens += completion.usage.prompt_tokens
        output_tokens += completion.usage.completion_tokens

        try:
            json_feedback = json.loads(feedback)
        except json.JSONDecodeError:
            print(red_text(f"Error: Invalid JSON response from OpenAI API: {feedback}"))
            continue

        if not valid_schema(json_feedback):
            print(red_text(f"Error: Invalid JSON response from OpenAI API: {feedback}"))
            continue

        if json_feedback["status"] == "error":
            # Red text for the error message part only
            print_error_title(f"Potential error in division id: {id}", json_feedback["severity"])
            # Normal color for feedback
            print(json_feedback["detail"])
            save_error_report(id, gadm_uid, hierarchy, json_feedback["detail"])
        else:
            print(green_text("OK."))
            checked_ids = siblings + [id]
            add_to_cache(checked_ids)
    except openai.OpenAIError as e:
        # Red text for exceptions
        print(red_text(f"Error: {e}"))
        continue  # Continue with the next iteration

# Count costs
input_price = 0.001 if args.cheap else 0.01
output_price = 0.002 if args.cheap else 0.02

input_cost = input_price * float(input_tokens) / 1000
output_cost = output_price * float(output_tokens) / 1000

print(f"Input tokens: {input_tokens}, cost: {input_cost}")
print(f"Output tokens: {output_tokens}, cost: {output_cost}")

# Close database connection
cur.close()
conn.close()
