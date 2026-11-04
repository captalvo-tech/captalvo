import struct, sys

def main():
    path = "/home/u415074840/domains/captalvo.online/Zero-Hour-Files/Command_and_Conquer_Generals_Zero_Hour/WindowZH.big"
    with open(path, "rb") as f:
        hdr = f.read(16)
        magic, total_size, num_files, toc_size = struct.unpack(">4sIII", hdr)
        toc = f.read(toc_size)
        pos = 0
        for _ in range(num_files):
            off, sz = struct.unpack_from(">II", toc, pos)
            pos += 8
            end = toc.find(b"\x00", pos)
            name = toc[pos:end].decode("utf-8", errors="ignore")
            pos = end + 1
            if "mainmenu.wnd" in name.lower():
                f.seek(off)
                content = f.read(sz).decode("utf-8", errors="ignore")
                lines = content.splitlines()
                cur_btn = None
                cur_rect = None
                for i, l in enumerate(lines):
                    if "NAME = \"MainMenu.wnd:Button" in l:
                        btn_name = l.split("=")[1].strip().strip('"')
                        # look back a few lines for SCREENRECT
                        for k in range(max(0, i-6), i):
                            if "SCREENRECT" in lines[k]:
                                rect = lines[k].strip() + " " + lines[k+1].strip()
                                print(f"{btn_name} -> {rect}")
                break

if __name__ == "__main__":
    main()

