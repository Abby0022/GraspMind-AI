import asyncio
from graspmind.config import get_settings
from graspmind.supabase_client import get_service_client

async def check_schema():
    settings = get_settings()
    client = await get_service_client(settings)
    
    print("Checking 'audit_logs' columns...")
    try:
        # Querying the information_schema to see what Postgres actually thinks
        res = await client.rpc("get_table_columns", {"table_name": "audit_logs"}).execute()
        print("Columns (via RPC):", res.data)
    except Exception as e:
        print("RPC failed (probably get_table_columns doesn't exist). Trying raw select...")
        try:
            # Try a select of 1 row to see what columns come back
            res = await client.table("audit_logs").select("*").limit(1).execute()
            if res.data:
                print("Columns (via Select):", list(res.data[0].keys()))
            else:
                print("Table is empty, cannot determine columns via select *")
        except Exception as e2:
            print("Select failed:", e2)

if __name__ == "__main__":
    asyncio.run(check_schema())
