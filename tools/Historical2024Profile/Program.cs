using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Xml;

var workbookPath = args.ElementAtOrDefault(0) ?? @"C:\Users\Zanga Musakuzi\Desktop\tracer dashboard\FEBRUARY-DECEMBER 2024.xlsx";
var outputPath = args.ElementAtOrDefault(1) ?? Path.Combine("tmp", "tracer-2024-profile.json");

using var archive = ZipFile.OpenRead(workbookPath);
var sharedStrings = LoadSharedStrings(archive);
var sheet = archive.GetEntry("xl/worksheets/sheet1.xml") ?? throw new InvalidOperationException("SUMMARY SHEET is missing.");
var profile = new Profile { Workbook = Path.GetFileName(workbookPath), SharedStrings = sharedStrings.Count };

using (var stream = sheet.Open())
using (var reader = XmlReader.Create(stream, new XmlReaderSettings { IgnoreWhitespace = true }))
{
    string[] headers = Array.Empty<string>();
    while (reader.Read())
    {
        if (reader.NodeType != XmlNodeType.Element || reader.LocalName != "row") continue;
        var rowNumber = int.Parse(reader.GetAttribute("r") ?? "0", CultureInfo.InvariantCulture);
        var cells = ReadRow(reader.ReadSubtree(), sharedStrings);
        if (rowNumber == 1)
        {
            headers = Enumerable.Range(0, 19).Select(index => Clean(cells.GetValueOrDefault(index)) ?? $"COLUMN_{index + 1}").ToArray();
            profile.Columns = headers;
            continue;
        }
        if (headers.Length == 0) continue;
        profile.Rows++;
        var record = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < headers.Length; index++) record[headers[index]] = Clean(cells.GetValueOrDefault(index));

        var date = ToIsoDate(record.GetValueOrDefault("DATE"));
        var province = Clean(record.GetValueOrDefault("PROVINCE"));
        var district = Clean(record.GetValueOrDefault("DISTRICT"));
        var level = Clean(record.GetValueOrDefault("FACILITY LEVEL"));
        var facility = Clean(record.GetValueOrDefault("FACILITY NAME"));
        var item = Clean(record.GetValueOrDefault("DESCRIPTION OF ITEM"));
        Count(profile.Dates, date, profile.MissingCoreFields, "date");
        Count(profile.Provinces, province, profile.MissingCoreFields, "province");
        if (district is null) profile.MissingCoreFields["district"]++;
        else if (province is not null)
        {
            if (!profile.DistrictsByProvince.TryGetValue(province, out var districts)) profile.DistrictsByProvince[province] = districts = new(StringComparer.OrdinalIgnoreCase);
            districts.TryGetValue(district, out var current); districts[district] = current + 1;
        }
        Count(profile.Levels, level, profile.MissingCoreFields, "level");
        if (facility is null) profile.MissingCoreFields["facility"]++;
        if (item is null) profile.MissingCoreFields["item"]++;
        foreach (var field in new[] { "QUANTITY", "AMC", "MOS", "AVAILABILITY" }) if (Clean(record.GetValueOrDefault(field)) is null) profile.MissingCoreFields[field.ToLowerInvariant()]++;
        if (record.GetValueOrDefault("AVAILABILITY") is { } availability && !IsNumber(availability.TrimEnd('%'))) profile.InvalidAvailability++;
        if (record.GetValueOrDefault("MOS") is { } mos && !IsNumber(mos)) profile.InvalidMos++;
        if (profile.SampleRows.Count < 5) profile.SampleRows.Add(new SampleRow(date, province, district, level, facility, item, record.GetValueOrDefault("QUANTITY"), record.GetValueOrDefault("AMC"), record.GetValueOrDefault("MOS"), record.GetValueOrDefault("AVAILABILITY")));
    }
}

Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? ".");
await File.WriteAllTextAsync(outputPath, JsonSerializer.Serialize(profile, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"Profile written: {profile.Rows:N0} rows, {profile.Dates.Count} reporting dates, {profile.Provinces.Count} provinces.");

static List<string> LoadSharedStrings(ZipArchive archive)
{
    var entry = archive.GetEntry("xl/sharedStrings.xml") ?? throw new InvalidOperationException("Shared strings are missing.");
    var values = new List<string>();
    using var stream = entry.Open();
    using var reader = XmlReader.Create(stream, new XmlReaderSettings { IgnoreWhitespace = true });
    while (reader.Read())
    {
        if (reader.NodeType != XmlNodeType.Element || reader.LocalName != "si") continue;
        using var itemReader = reader.ReadSubtree();
        var builder = new StringBuilder();
        while (itemReader.Read()) if (itemReader.NodeType == XmlNodeType.Element && itemReader.LocalName == "t") builder.Append(itemReader.ReadElementContentAsString());
        values.Add(builder.ToString());
    }
    return values;
}

static Dictionary<int, string?> ReadRow(XmlReader reader, IReadOnlyList<string> sharedStrings)
{
    var cells = new Dictionary<int, string?>();
    while (reader.Read())
    {
        if (reader.NodeType != XmlNodeType.Element || reader.LocalName != "c") continue;
        var reference = reader.GetAttribute("r") ?? "";
        var type = reader.GetAttribute("t");
        var index = ColumnIndex(reference);
        string? raw = null;
        using var cellReader = reader.ReadSubtree();
        while (cellReader.Read()) if (cellReader.NodeType == XmlNodeType.Element && cellReader.LocalName == "v") { raw = cellReader.ReadElementContentAsString(); break; }
        if (raw is not null && type == "s" && int.TryParse(raw, out var sharedIndex)) raw = sharedStrings[sharedIndex];
        cells[index] = raw;
    }
    return cells;
}

static int ColumnIndex(string reference)
{
    var total = 0;
    foreach (var character in reference.TakeWhile(char.IsLetter)) total = total * 26 + (char.ToUpperInvariant(character) - 'A' + 1);
    return total - 1;
}

static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
static bool IsNumber(string value) => double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out _) || double.TryParse(value, NumberStyles.Float, CultureInfo.CurrentCulture, out _);
static string? ToIsoDate(string? value) => IsNumber(value ?? "") && double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var serial) ? DateTime.FromOADate(serial).ToString("yyyy-MM-dd") : value;
static void Count(Dictionary<string, int> map, string? value, Dictionary<string, int> missing, string key)
{
    if (value is null) { missing[key]++; return; }
    map.TryGetValue(value, out var current); map[value] = current + 1;
}

sealed class Profile
{
    public string Workbook { get; set; } = "";
    public int SharedStrings { get; set; }
    public int Rows { get; set; }
    public string[] Columns { get; set; } = Array.Empty<string>();
    public Dictionary<string, int> Dates { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, int> Provinces { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, Dictionary<string, int>> DistrictsByProvince { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, int> Levels { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, int> MissingCoreFields { get; set; } = new() { ["date"] = 0, ["province"] = 0, ["district"] = 0, ["level"] = 0, ["facility"] = 0, ["item"] = 0, ["quantity"] = 0, ["amc"] = 0, ["mos"] = 0, ["availability"] = 0 };
    public int InvalidAvailability { get; set; }
    public int InvalidMos { get; set; }
    public List<SampleRow> SampleRows { get; set; } = new();
}

record SampleRow(string? Date, string? Province, string? District, string? Level, string? Facility, string? Item, string? Quantity, string? Amc, string? Mos, string? Availability);
