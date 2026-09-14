from app.migrate import upgrade_to_head

if __name__=="__main__":
    upgrade_to_head()
    print("schema up to date")
