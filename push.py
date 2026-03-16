import subprocess
import sys

def run_command(command_list):
    try:
        # Menjalankan perintah dan output akan langsung tampil di terminal IDE
        subprocess.run(command_list, check=True, text=True)
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Gagal saat menjalankan perintah: {' '.join(command_list)}")
        sys.exit(1)

def main():
    print("==============================================")
    print("             GitHub Auto Pusher               ")
    print("==============================================")

    # 1. Menambahkan file yang berubah
    print("\n[1/3] Menambahkan semua perubahan (git add .)...")
    run_command(["git", "add", "."])

    # 2. Melakukan commit
    print("\n[2/3] Masukkan pesan commit (kosongi untuk menggunakan pesan default):")
    commit_msg = input("> ").strip()
    
    if not commit_msg:
        commit_msg = "Auto update via script"
        print(f"Menggunakan pesan default: '{commit_msg}'")
    
    # Gunakan subprocess.run manual di sini karena kalau tidak ada yang berubah, git commit me-return kode error 1
    # Kita tidak ingin script langsung berhenti (exit) kalau hanya masalah "nothing to commit"
    result = subprocess.run(["git", "commit", "-m", commit_msg], capture_output=True, text=True)
    if result.returncode != 0:
        output = result.stdout + result.stderr
        if "nothing to commit" in output:
            print("✅ Tidak ada file baru yang perlu di-commit (sudah up-to-date).")
        else:
            print(f"❌ Error saat commit:\n{output}")
            sys.exit(1)
    else:
        print(f"Berhasil commit: {result.stdout.strip()}")

    # 3. Mengirim ke GitHub
    print("\n[3/3] Mengirim file ke GitHub (git push)...")
    # Kamu bisa mengubah 'main' ke branch lain jika kamu tidak menggunakan main branch
    run_command(["git", "push", "origin", "main"])

    print("\n==============================================")
    print("            ✅ SELESAI PUSH! ✅               ")
    print("==============================================")

if __name__ == "__main__":
    main()
