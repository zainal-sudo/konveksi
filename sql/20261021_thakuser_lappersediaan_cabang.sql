-- Laporan Persediaan (menu 96 frmLapPersediaan) diberikan ke user cabang
-- View saja (laporan, tidak boleh insert/edit/delete).
-- catatan: thakuser memakai kolom hak_men_view/hak_men_insert/hak_men_edit/hak_men_delete

INSERT INTO thakuser
     (HAK_USER_KODE, HAK_MEN_ID, hak_men_insert, hak_men_edit, hak_men_delete, hak_men_view)
VALUES ('cabang1', 96, 'N', 'N', 'N', 'Y'),
       ('cabang2', 96, 'N', 'N', 'N', 'Y');

-- (Sudah dijalankan di DB konveksi.)
