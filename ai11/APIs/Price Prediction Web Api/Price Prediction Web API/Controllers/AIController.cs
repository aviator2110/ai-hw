using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Price_Prediction_Web_API.DTOs;

namespace Price_Prediction_Web_API.Controllers;

[Route("api/[controller]")]
[ApiController]
public class AIController : ControllerBase
{
    private readonly HttpClient _httpClient;

    public AIController(IHttpClientFactory factory)
    {
        _httpClient = factory.CreateClient("ai");
    }

    [HttpPost]
    public async Task<IActionResult> Predict([FromBody] PredictIn predict)
    {
        return await ForwardToAiAsync<PredictOut>(
            () => _httpClient.PostAsJsonAsync("/predict", predict, HttpContext.RequestAborted));
    }

    [HttpPost("apartments")]
    public async Task<IActionResult> AddApartment([FromBody] ApartmentIn apartment)
    {
        if (apartment.Bedrooms <= 0)
            return BadRequest(new { detail = "Bedrooms must be a positive integer." });

        if (apartment.Bathrooms <= 0)
            return BadRequest(new { detail = "Bathrooms must be a positive integer." });

        if (float.IsNaN(apartment.Sqm) || float.IsInfinity(apartment.Sqm) || apartment.Sqm <= 0)
            return BadRequest(new { detail = "Sqm must be a positive number." });

        if (float.IsNaN(apartment.PriceAZN) || float.IsInfinity(apartment.PriceAZN) || apartment.PriceAZN <= 0)
            return BadRequest(new { detail = "PriceAZN must be a positive number." });

        if (string.IsNullOrWhiteSpace(apartment.City))
            return BadRequest(new { detail = "City cannot be empty." });

        return await ForwardToAiAsync<DataOperationOut>(
            () => _httpClient.PostAsJsonAsync("/apartments", apartment, HttpContext.RequestAborted));
    }

    [HttpPost("apartments/import")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> ImportApartments(IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { detail = "Please select a non-empty CSV file." });

        if (!file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { detail = "Only .csv files are supported." });

        return await ForwardToAiAsync<DataOperationOut>(async () =>
        {
            using var form = new MultipartFormDataContent();
            await using var stream = file.OpenReadStream();
            using var fileContent = new StreamContent(stream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
            form.Add(fileContent, "file", file.FileName);

            return await _httpClient.PostAsync("/apartments/import", form, HttpContext.RequestAborted);
        });
    }

    [HttpPost("retrain")]
    public async Task<IActionResult> Retrain()
    {
        return await ForwardToAiAsync<RetrainOut>(
            () => _httpClient.PostAsync("/retrain", null, HttpContext.RequestAborted));
    }

    private async Task<IActionResult> ForwardToAiAsync<TOut>(Func<Task<HttpResponseMessage>> sendRequest)
    {
        try
        {
            using var response = await sendRequest();

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);
                var statusCode = (int)response.StatusCode;

                if (TryExtractDetail(errorBody, out var detail))
                {
                    return StatusCode(statusCode, new { detail });
                }

                return StatusCode(statusCode, new
                {
                    detail = string.IsNullOrWhiteSpace(errorBody)
                        ? $"AI service returned HTTP {statusCode}."
                        : errorBody
                });
            }

            var payload = await response.Content.ReadFromJsonAsync<TOut>(
                cancellationToken: HttpContext.RequestAborted);

            if (payload is null)
            {
                return StatusCode(StatusCodes.Status502BadGateway, new
                {
                    detail = "AI service returned an empty response."
                });
            }

            return Ok(payload);
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                detail = "AI service (FastAPI) is unavailable. Please make sure it is running."
            });
        }
        catch (TaskCanceledException) when (!HttpContext.RequestAborted.IsCancellationRequested)
        {
            return StatusCode(StatusCodes.Status504GatewayTimeout, new
            {
                detail = "AI service request timed out. Retraining or processing took too long."
            });
        }
    }

    private static bool TryExtractDetail(string body, out string detail)
    {
        detail = string.Empty;
        if (string.IsNullOrWhiteSpace(body))
            return false;

        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty("detail", out var detailProp))
            {
                detail = detailProp.ValueKind == JsonValueKind.String
                    ? detailProp.GetString() ?? string.Empty
                    : detailProp.ToString();
                return !string.IsNullOrWhiteSpace(detail);
            }
        }
        catch (JsonException)
        {
            
        }

        return false;
    }
}
