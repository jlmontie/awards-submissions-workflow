"""
The PDF processor's Drive copy: clearing NeedAppearances on forms that would
otherwise display blank.

Forms saved by macOS Preview keep every value but set NeedAppearances and
drop the font list their fields name. Viewers that honor the flag (Chrome,
Drive's preview) then draw the fields empty. In 2026 that hid 9 of 121
submissions in Drive while the Sheet, read from the values, was complete.

The forms here are synthetic, built to the same shape: submissions are not
committed to a public repository.
"""

import io
from unittest import mock

import pikepdf
import pytest

from conftest import pdf_processor
from test_photos_folder import Stop, make_event


def make_form(value='WW CLYDE SPANISH FORK SHOP', drawn=None, need_appearances=True,
              defined_fonts=(), da='0 0 0 rg /Helv 9 Tf'):
    """A one-field form shaped like a Preview-saved submission."""
    drawn = value if drawn is None else drawn
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(612, 792))
    font = pdf.make_indirect(pikepdf.Dictionary(
        Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica))
    appearance = pdf.make_stream(
        b'/Tx BMC BT 0 0 0 rg /Helv 9 Tf 2 5 Td ' + pikepdf.String(drawn).unparse() + b' Tj ET EMC',
        Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Form, BBox=[0, 0, 480, 18],
        Resources=pikepdf.Dictionary(Font=pikepdf.Dictionary(Helv=font)))
    widget = pdf.make_indirect(pikepdf.Dictionary(
        Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Widget, FT=pikepdf.Name.Tx,
        T=pikepdf.String('Official Name'), V=pikepdf.String(value), DA=pikepdf.String(da),
        Rect=[93, 547, 572, 565], AP=pikepdf.Dictionary(N=appearance)))
    pdf.pages[0].Annots = pdf.make_indirect(pikepdf.Array([widget]))
    acro = pikepdf.Dictionary(Fields=pikepdf.Array([widget]),
                              NeedAppearances=need_appearances)
    if defined_fonts:
        acro.DR = pikepdf.Dictionary(Font=pikepdf.Dictionary({n: font for n in defined_fonts}))
    pdf.Root.AcroForm = acro
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue()


def need_appearances(pdf_bytes):
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        return bool(pdf.Root.AcroForm.get('/NeedAppearances', False))


def values(pdf_bytes):
    with pikepdf.open(io.BytesIO(pdf_bytes)) as pdf:
        return [str(f.V) for f in pdf.Root.AcroForm.Fields]


def test_clears_the_flag_on_a_form_that_would_display_blank():
    original = make_form()
    copy = pdf_processor.drive_display_copy(original)
    assert need_appearances(original) and not need_appearances(copy)
    assert values(copy) == values(original)


def test_tolerates_non_ascii_encoded_differently_in_the_drawing():
    # The value has a curly apostrophe; the drawing's font encoding renders
    # it as a different character, as Preview's appearances do.
    copy = pdf_processor.drive_display_copy(
        make_form(value='Utah’s busiest freeway', drawn='UtahÕs busiest freeway'))
    assert not need_appearances(copy)


@pytest.mark.parametrize('form', [
    # The drawing doesn't show the value: the flag is what makes it display.
    make_form(drawn='something else'),
    make_form(drawn=''),
    # The form defines the font its fields use, so viewers can redraw them.
    make_form(defined_fonts=('/Helv',)),
    # Nothing asks viewers to redraw.
    make_form(need_appearances=False),
    # Nothing is filled in.
    make_form(value=''),
], ids=['drawing-differs', 'nothing-drawn', 'font-defined', 'flag-not-set', 'empty'])
def test_leaves_other_forms_byte_for_byte(form):
    assert pdf_processor.drive_display_copy(form) == form


def test_uploads_the_original_when_the_pdf_cannot_be_parsed():
    assert pdf_processor.drive_display_copy(b'not a pdf') == b'not a pdf'


def test_process_pdf_uploads_the_display_copy_and_reads_the_original():
    original = make_form()
    event = make_event('submissions/2026/abc-123/pdf/form.pdf', __import__('datetime').timedelta(0))
    extract = mock.Mock(return_value={'Official Name': 'WW CLYDE SPANISH FORK SHOP'})

    with mock.patch.object(pdf_processor, 'storage_client') as storage, \
         mock.patch.object(pdf_processor, 'extract_pdf_fields', extract), \
         mock.patch.object(pdf_processor, 'get_secret', return_value='id'), \
         mock.patch.object(pdf_processor, 'get_sheets_service'), \
         mock.patch.object(pdf_processor, 'submission_already_recorded', return_value=False), \
         mock.patch.object(pdf_processor, 'get_drive_service', return_value='drive'), \
         mock.patch.object(pdf_processor, 'find_or_create_folder', return_value='folder-1'),          mock.patch.object(pdf_processor, 'find_or_create_project_folder', return_value='folder-2'),          mock.patch.object(pdf_processor, 'generate_awards_id', return_value='AW-2026-001'), \
         mock.patch.object(pdf_processor, 'upload_to_drive', side_effect=Stop) as upload:
        blob = storage.bucket.return_value.blob.return_value
        blob.size = len(original)
        blob.download_as_bytes.return_value = original
        with pytest.raises(Stop):
            pdf_processor.process_pdf(event)

    extract.assert_called_once_with(original)
    uploaded = upload.call_args.args[1]
    assert not need_appearances(uploaded)
    assert values(uploaded) == values(original)
