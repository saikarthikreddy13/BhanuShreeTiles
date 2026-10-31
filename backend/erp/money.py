from decimal import ROUND_HALF_UP, Decimal

from .errors import bad_request

CENT = Decimal("0.01")


def D(value):
    return Decimal(str(value if value is not None else 0))


def round2(value):
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def plain(value):
    """1500.00 -> 1500, as shown in messages and API responses."""
    text = format(D(value), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def compute_totals(lines, document_discount=0):
    """lines: [{productId, quantity, unitPrice, discount, taxPercent}]

    A document-level discount is spread across lines by value, so GST stays correct per line.
    """
    gross = []
    for line in lines:
        base = D(line["quantity"]) * D(line["unitPrice"])
        line_discount = D(line.get("discount"))
        if line_discount > base:
            raise bad_request("Line discount cannot exceed the line value")
        gross.append({"base": base, "discount": line_discount, "taxable": base - line_discount})

    subtotal = sum((g["base"] for g in gross), D(0))
    pre_discount = sum((g["taxable"] for g in gross), D(0))
    extra = round2(document_discount)
    if extra < 0 or extra > pre_discount:
        raise bad_request("Discount cannot exceed the bill value")

    allocated = D(0)
    items = []
    for i, line in enumerate(lines):
        if i == len(lines) - 1:
            share = extra - allocated
        elif pre_discount == 0:
            share = D(0)
        else:
            share = round2(extra * gross[i]["taxable"] / pre_discount)
        allocated += share
        taxable = gross[i]["taxable"] - share
        tax_amount = round2(taxable * D(line["taxPercent"]) / 100)
        items.append({
            **line,
            "discount": round2(gross[i]["discount"] + share),
            "taxAmount": tax_amount,
            "totalAmount": round2(taxable + tax_amount),
        })

    return {
        "items": items,
        "subtotal": round2(subtotal),
        "discount": sum((it["discount"] for it in items), D(0)),
        "taxAmount": sum((it["taxAmount"] for it in items), D(0)),
        "totalAmount": sum((it["totalAmount"] for it in items), D(0)),
    }
